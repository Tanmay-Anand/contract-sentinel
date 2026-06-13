package io.contractsentinel.snapshot;

import io.contractsentinel.drift.DriftDetectionService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
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
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class SpecFetcherScheduler {

    private final ServiceRegistryRepository serviceRepository;
    private final SpecSnapshotRepository snapshotRepository;
    private final DriftDetectionService driftDetectionService;

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

        // Use most-recent successfully FETCHED snapshot as diff baseline.
        // UNREACHABLE snapshots have null specJson and must never be used for diffing.
        Optional<SpecSnapshot> previous = snapshotRepository
                .findTopByServiceAndFetchStatusOrderByFetchedAtDesc(service, SpecSnapshot.FetchStatus.FETCHED);

        try {
            String specJson = restClient.get()
                    .uri(specUrl)
                    .retrieve()
                    .body(String.class);

            if (specJson == null || specJson.isBlank()) {
                saveUnreachable(service);
                return;
            }

            String hash = sha256(specJson);

            if (previous.isPresent() && hash.equals(previous.get().getSpecHash())) {
                log.debug("No spec change detected for {}", service.getName());
                return;
            }

            SpecSnapshot snapshot = snapshotRepository.save(SpecSnapshot.builder()
                    .service(service)
                    .specJson(specJson)
                    .specHash(hash)
                    .fetchedAt(Instant.now())
                    .fetchStatus(SpecSnapshot.FetchStatus.FETCHED)
                    .build());

            previous.ifPresent(prev -> driftDetectionService.detectAndPersist(service, prev, snapshot));

        } catch (Exception e) {
            log.warn("Failed to fetch spec from {}: {}", specUrl, e.getMessage());
            saveUnreachable(service);
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
