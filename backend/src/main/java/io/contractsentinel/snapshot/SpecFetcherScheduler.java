package io.contractsentinel.snapshot;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import io.contractsentinel.alert.AlertService;
import io.contractsentinel.deployment.DeploymentService;
import io.contractsentinel.drift.DriftDetectionService;
import io.contractsentinel.graph.DependencyGraphService;
import io.contractsentinel.latency.LatencyService;
import io.contractsentinel.migration.FlywayMigrationService;
import io.contractsentinel.performance.EndpointPerformanceService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.stats.OutboundCallCounter;
import io.contractsentinel.trace.TraceService;
import io.contractsentinel.ws.WebSocketEventPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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
    private final io.contractsentinel.graph.OutboundCallScannerService outboundCallScannerService;
    private final EndpointPerformanceService endpointPerformanceService;
    private final TraceService traceService;
    private final OutboundCallCounter callCounter;
    private final WebSocketEventPublisher eventPublisher;
    private final PollWatchdog pollWatchdog;
    private final FlywayMigrationService flywayMigrationService;

    @Value("${sentinel.performance.retention-days:30}")
    private int performanceRetentionDays;

    @Value("${sentinel.traces.retention-hours:24}")
    private int traceRetentionHours;

    /** A spec larger than this goes straight to a TEXT column and the JVM heap â€” reject it. */
    @Value("${sentinel.poll.max-spec-bytes:10485760}")
    private int maxSpecBytes;

    // Number of consecutive UNREACHABLE polls required before firing health.changed + alert.
    // Prevents one-off transient failures from spamming alerts (flap suppression).
    @Value("${sentinel.poll.flap-threshold:2}")
    private int flapThreshold;

    // Tracks consecutive UNREACHABLE counts per service (in-memory; resets on restart).
    private final ConcurrentHashMap<UUID, Integer> consecutiveFailures = new ConcurrentHashMap<>();
    // Services for which we have already fired the unhealthy event (so we can emit recovery).
    private final Set<UUID> alertedUnhealthy = ConcurrentHashMap.newKeySet();

    private final ObjectMapper objectMapper = new ObjectMapper();

    // JDK HttpClient manages its own connection pool; shared across all poll threads.
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private final RestClient restClient = RestClient.builder()
            .requestFactory(readTimeout(new JdkClientHttpRequestFactory(httpClient), Duration.ofSeconds(30)))
            .build();

    private static JdkClientHttpRequestFactory readTimeout(JdkClientHttpRequestFactory f, Duration d) {
        f.setReadTimeout(d);
        return f;
    }

    @Scheduled(
            fixedDelayString = "${sentinel.poll.interval-ms:300000}",
            initialDelayString = "${sentinel.poll.initial-delay-ms:15000}"
    )
    public void pollAll() {
        List<ServiceRegistry> services = serviceRepository.findAllByActiveTrue();
        if (services.isEmpty()) return;
        log.info("Starting parallel spec poll for {} active service(s)", services.size());

        // Virtual-thread fan-out: each service polled concurrently; close() awaits all.
        try (ExecutorService vt = Executors.newVirtualThreadPerTaskExecutor()) {
            for (ServiceRegistry svc : services) {
                vt.submit(() -> {
                    try {
                        pollService(svc);
                    } catch (Exception e) {
                        log.warn("Poll failed for {}: {}", svc.getName(), e.getMessage());
                    }
                });
            }
        }
        // ExecutorService.close() blocks until all virtual threads complete.
        pollWatchdog.recordPollCycleComplete();
    }

    @Scheduled(
            fixedDelayString = "${sentinel.performance.purge-interval-ms:3600000}",
            initialDelayString = "${sentinel.poll.initial-delay-ms:15000}"
    )
    public void purgePerformanceSnapshots() {
        try {
            endpointPerformanceService.purgeOlderThan(performanceRetentionDays);
        } catch (Exception e) {
            log.warn("Performance snapshot retention purge failed: {}", e.getMessage());
        }
    }

    @Scheduled(
            fixedDelayString = "${sentinel.traces.purge-interval-ms:3600000}",
            initialDelayString = "${sentinel.poll.initial-delay-ms:15000}"
    )
    public void purgeTraceSpans() {
        try {
            traceService.purgeOlderThan(traceRetentionHours);
        } catch (Exception e) {
            log.warn("Trace span retention purge failed: {}", e.getMessage());
        }
    }

    @Scheduled(
            fixedDelayString = "${sentinel.flyway.poll-interval-ms:900000}",
            initialDelayString = "${sentinel.poll.initial-delay-ms:15000}"
    )
    public void syncFlywayAll() {
        List<ServiceRegistry> services = serviceRepository.findAllByActiveTrue();
        if (services.isEmpty()) return;
        try (ExecutorService vt = Executors.newVirtualThreadPerTaskExecutor()) {
            for (ServiceRegistry svc : services) {
                vt.submit(() -> {
                    try {
                        flywayMigrationService.syncFromActuator(svc);
                        flywayMigrationService.syncFromFilesystem(svc);
                    } catch (Exception e) {
                        log.warn("Flyway sync failed for {}: {}", svc.getName(), e.getMessage());
                    }
                });
            }
        }
    }

    public void pollService(ServiceRegistry service) {
        String specUrl = service.getBaseUrl() + service.getSpecPath();
        log.info("Polling spec from {}", specUrl);

        Optional<SpecSnapshot> latest = snapshotRepository
                .findTopByServiceAndFetchStatusOrderByFetchedAtDesc(service, SpecSnapshot.FetchStatus.FETCHED);
        Optional<SpecSnapshot> baseline = snapshotRepository
                .findTopByServiceAndFetchStatusOrderByFetchedAtAsc(service, SpecSnapshot.FetchStatus.FETCHED);

        try {
            long startMs = System.currentTimeMillis();
            String specJson = restClient.get()
                    .uri(specUrl)
                    .retrieve()
                    .body(String.class);
            long durationMs = System.currentTimeMillis() - startMs;

            if (specJson != null && specJson.length() > maxSpecBytes) {
                log.warn("Spec from {} is {} chars â€” exceeds cap of {} bytes; treating as parse failure",
                        specUrl, specJson.length(), maxSpecBytes);
                snapshotRepository.save(SpecSnapshot.builder()
                        .service(service)
                        .specJson(null)
                        .specHash("")
                        .fetchedAt(Instant.now())
                        .fetchStatus(SpecSnapshot.FetchStatus.PARSE_FAILED)
                        .fetchDurationMs(durationMs)
                        .build());
                return;
            }

            if (specJson == null || specJson.isBlank()) {
                recordFailure(service);
                return;
            }

            // Successful fetch â€” clear failure tracking and emit recovery if needed.
            onSuccess(service);

            callCounter.incSpecPolls();
            latencyService.recordSpecFetch(service, durationMs);
            pollActuatorInfo(service);
            dependencyGraphService.scanDependencies(service);
            outboundCallScannerService.scanAndEnrich(service);
            try {
                EndpointPerformanceService.CollectionResult perf = endpointPerformanceService.collectForService(service);
                if (perf != null) {
                    latencyService.updateLatestWithPrometheusData(
                            service, perf.serviceMaxP95Ms(), perf.serviceMaxP50Ms(),
                            perf.dominantMethod(), perf.dominantPath());
                }
            } catch (Exception e) {
                log.warn("Performance collection failed for {}: {}", service.getName(), e.getMessage());
            }

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

            baseline.ifPresent(base -> driftDetectionService.detectAndPersist(service, base, snapshot));

        } catch (Exception e) {
            log.warn("Failed to fetch spec from {}: {}", specUrl, e.getMessage());
            recordFailure(service);
        }
    }

    private void recordFailure(ServiceRegistry service) {
        snapshotRepository.save(SpecSnapshot.builder()
                .service(service)
                .specJson(null)
                .specHash("")
                .fetchedAt(Instant.now())
                .fetchStatus(SpecSnapshot.FetchStatus.UNREACHABLE)
                .build());

        int count = consecutiveFailures.merge(service.getId(), 1, Integer::sum);
        if (count >= flapThreshold && alertedUnhealthy.add(service.getId())) {
            // Threshold crossed for the first time â€” fire event + alert.
            alertService.evaluateUnreachable(service.getId(), service.getName());
            eventPublisher.publish("health.changed", Map.of(
                    "serviceId", service.getId().toString(),
                    "serviceName", service.getName(),
                    "healthy", false));
        }
    }

    private void onSuccess(ServiceRegistry service) {
        consecutiveFailures.remove(service.getId());
        // Only emit recovery if we previously fired the unhealthy event.
        if (alertedUnhealthy.remove(service.getId())) {
            eventPublisher.publish("health.changed", Map.of(
                    "serviceId", service.getId().toString(),
                    "serviceName", service.getName(),
                    "healthy", true));
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
