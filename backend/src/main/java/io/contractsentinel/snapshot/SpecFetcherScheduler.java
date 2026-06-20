package io.contractsentinel.snapshot;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.alert.AlertService;
import io.contractsentinel.deployment.DeploymentService;
import io.contractsentinel.drift.DriftDetectionService;
import io.contractsentinel.graph.DependencyGraphService;
import io.contractsentinel.graph.OutboundCallScannerService;
import io.contractsentinel.latency.LatencyService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.stats.OutboundCallCounter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class SpecFetcherScheduler {

    private final ServiceRegistryRepository serviceRepository;
    private final SpecSnapshotRepository snapshotRepository;
    private final DriftDetectionService driftDetectionService;
    private final LatencyService latencyService;
    private final DeploymentService deploymentService;
    private final AlertService alertService;
    private final DependencyGraphService dependencyGraphService;
    private final OutboundCallScannerService outboundCallScannerService;
    private final OutboundCallCounter callCounter;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final RestClient restClient = RestClient.builder()
            .requestFactory(timeoutFactory(Duration.ofSeconds(10), Duration.ofSeconds(30)))
            .build();

    private static SimpleClientHttpRequestFactory timeoutFactory(Duration connect, Duration read) {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(connect);
        f.setReadTimeout(read);
        return f;
    }

    @Scheduled(
            fixedDelayString = "${sentinel.poll.interval-ms:300000}",
            initialDelayString = "${sentinel.poll.initial-delay-ms:15000}"
    )
    public void pollAll() {
        log.info("Starting scheduled spec poll for all active services");
        serviceRepository.findAllByActiveTrue().forEach(this::pollService);
    }

    @Transactional
    public void pollService(ServiceRegistry service) {
        String specUrl = service.getBaseUrl() + service.getSpecPath();
        log.info("Polling spec from {}", specUrl);

        // Most-recent snapshot: used only for hash comparison (skip processing when spec unchanged).
        Optional<SpecSnapshot> latest = snapshotRepository
                .findTopByServiceAndFetchStatusOrderByFetchedAtDesc(service, SpecSnapshot.FetchStatus.FETCHED);

        // Oldest snapshot: the immutable baseline — drift is always measured against this.
        // Using the oldest (not the latest) means accumulated changes across restarts are never lost.
        Optional<SpecSnapshot> baseline = snapshotRepository
                .findTopByServiceAndFetchStatusOrderByFetchedAtAsc(service, SpecSnapshot.FetchStatus.FETCHED);

        try {
            long startMs = System.currentTimeMillis();
            String specJson = restClient.get()
                    .uri(specUrl)
                    .retrieve()
                    .body(String.class);
            long durationMs = System.currentTimeMillis() - startMs;

            if (specJson == null || specJson.isBlank()) {
                saveUnreachable(service);
                alertService.evaluateUnreachable(service.getId(), service.getName());
                return;
            }

            callCounter.incSpecPolls();
            latencyService.recordSpecFetch(service, durationMs);
            pollActuatorInfo(service);
            dependencyGraphService.scanDependencies(service);
            outboundCallScannerService.scanAndEnrich(service);

            String hash = sha256(specJson);

            if (latest.isPresent() && hash.equals(latest.get().getSpecHash())) {
                log.debug("No spec change detected for {}", service.getName());
                return;
            }

            SpecSnapshot snapshot = snapshotRepository.save(SpecSnapshot.builder()
                    .service(service)
                    .specJson(specJson)
                    .specHash(hash)
                    .fetchedAt(Instant.now())
                    .fetchStatus(SpecSnapshot.FetchStatus.FETCHED)
                    .fetchDurationMs(durationMs)
                    .build());

            // Compare baseline (oldest ever) vs new snapshot — not just the consecutive previous.
            // Deduplication in DriftDetectionService prevents duplicate events across polls.
            baseline.ifPresent(base -> driftDetectionService.detectAndPersist(service, base, snapshot));

        } catch (Exception e) {
            log.warn("Failed to fetch spec from {}: {}", specUrl, e.getMessage());
            saveUnreachable(service);
            alertService.evaluateUnreachable(service.getId(), service.getName());
        }
    }

    private void pollActuatorInfo(ServiceRegistry service) {
        try {
            String contextPath = contextPathFrom(service.getSpecPath());
            String infoJson = restClient.get()
                    .uri(service.getBaseUrl() + contextPath + "/actuator/info")
                    .retrieve()
                    .body(String.class);
            if (infoJson != null && !infoJson.isBlank()) {
                callCounter.incActuatorInfo();
                Map<String, Object> infoMap = objectMapper.readValue(infoJson, new TypeReference<>() {});
                deploymentService.detectAndRecord(service, infoMap);
            }
        } catch (Exception e) {
            log.debug("Could not fetch actuator/info for {}: {}", service.getName(), e.getMessage());
        }
    }

    private void saveUnreachable(ServiceRegistry service) {
        snapshotRepository.save(SpecSnapshot.builder()
                .service(service)
                .specJson(null)
                .specHash("")
                .fetchedAt(Instant.now())
                .fetchStatus(SpecSnapshot.FetchStatus.UNREACHABLE)
                .build());
    }

    private String contextPathFrom(String specPath) {
        if (specPath == null) return "";
        int idx = specPath.lastIndexOf("/v3/api-docs");
        if (idx <= 0) return "";
        return specPath.substring(0, idx);
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
