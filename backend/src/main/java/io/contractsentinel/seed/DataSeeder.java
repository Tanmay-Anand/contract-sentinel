package io.contractsentinel.seed;

import io.contractsentinel.config.SentinelProperties;
import io.contractsentinel.graph.ServiceDependency;
import io.contractsentinel.graph.ServiceDependencyRepository;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements ApplicationRunner {

    private final ServiceRegistryRepository repository;
    private final ServiceDependencyRepository dependencyRepository;
    private final SentinelProperties properties;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedServices();
        seedManualDependencies();
    }

    private void seedServices() {
        for (SentinelProperties.ServiceConfig cfg : properties.getServices()) {
            if (cfg.getName() == null || cfg.getBaseUrl() == null) {
                log.warn("Skipping service config with missing name or baseUrl");
                continue;
            }
            String specPath = cfg.getSpecPath() != null ? cfg.getSpecPath() : "/v3/api-docs";
            repository.findByName(cfg.getName()).ifPresentOrElse(
                    existing -> {
                        if (!specPath.equals(existing.getSpecPath())) {
                            existing.setSpecPath(specPath);
                            repository.save(existing);
                            log.info("Updated specPath for {} to {}", cfg.getName(), specPath);
                        }
                    },
                    () -> {
                        repository.save(ServiceRegistry.builder()
                                .name(cfg.getName())
                                .baseUrl(cfg.getBaseUrl())
                                .specPath(specPath)
                                .active(true)
                                .build());
                        log.info("Seeded {} into service registry", cfg.getName());
                    }
            );
        }
    }

    private void seedManualDependencies() {
        for (SentinelProperties.ManualDependencyConfig dep : properties.getManualDependencies()) {
            if (dep.getSource() == null || dep.getTarget() == null || dep.getPropertyName() == null) {
                log.warn("Skipping manual dependency with missing source, target, or propertyName");
                continue;
            }

            String sourceName = dep.getSource();
            String targetName = dep.getTarget();
            String propertyName = dep.getPropertyName();
            String endpointCallsJson = dep.getEndpointCallsJson() != null
                    ? dep.getEndpointCallsJson().strip()
                    : null;

            Optional<ServiceRegistry> source = repository.findByName(sourceName);
            Optional<ServiceRegistry> target = repository.findByName(targetName);

            if (source.isEmpty() || target.isEmpty()) {
                log.warn("Skipping manual dependency seed: {} → {} (service not found)", sourceName, targetName);
                continue;
            }

            Optional<ServiceDependency> existing = dependencyRepository
                    .findBySourceServiceAndTargetServiceAndDetectionMethod(
                            source.get(), target.get(), ServiceDependency.DetectionMethod.MANUAL);

            if (existing.isEmpty()) {
                dependencyRepository.save(ServiceDependency.builder()
                        .sourceService(source.get())
                        .targetService(target.get())
                        .detectionMethod(ServiceDependency.DetectionMethod.MANUAL)
                        .confidence(ServiceDependency.Confidence.HIGH)
                        .propertyName(propertyName)
                        .verifiedAt(Instant.now())
                        .endpointCallsJson(endpointCallsJson)
                        .build());
                log.info("Seeded manual dependency: {} → {} ({})", sourceName, targetName, propertyName);
            } else {
                // Keep endpoint calls in sync with the authoritative yaml config
                ServiceDependency e = existing.get();
                if (endpointCallsJson != null && !endpointCallsJson.equals(e.getEndpointCallsJson())) {
                    e.setEndpointCallsJson(endpointCallsJson);
                    dependencyRepository.save(e);
                    log.info("Updated endpoint calls for manual dep: {} → {} ({})", sourceName, targetName, propertyName);
                }
            }
        }
    }
}
