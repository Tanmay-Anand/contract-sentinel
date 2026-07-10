package io.contractsentinel.seed;

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
import java.util.List;
import java.util.Optional;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements ApplicationRunner {

    private final ServiceRegistryRepository repository;
    private final ServiceDependencyRepository dependencyRepository;

    private static final List<String[]> SERVICES = List.of(
            new String[]{"crm-post-sales-api",         "http://localhost:8081", "/post-sales/v3/api-docs"},
            new String[]{"crm-pre-sales-api",          "http://localhost:8082", "/pre-sales/v3/api-docs"},
            new String[]{"crm-post-sales-reports-api", "http://localhost:8083", "/post-sales-reports/v3/api-docs"},
            new String[]{"crm-pre-sales-reports-api",  "http://localhost:8084", "/pre-sales-reports/v3/api-docs"},
            new String[]{"crm-platform-api",           "http://localhost:8085", "/platform/v3/api-docs"}
    );

    // [sourceName, targetName, propertyName, endpointCallsJson_or_null]
    // Only for dependencies not auto-detectable via /actuator/env:
    //   - shared-database  : same PostgreSQL database, no HTTP property
    //   - internal-rest    : internal signed RestClient (no @HttpExchange, cannot be discovered by outbound scanner)
    //   - webhook          : push callback from source to target
    // HTTP client deps (ACTUATOR_ENV detection) get endpoint calls from OutboundCallScannerService.
    private static final List<String[]> MANUAL_DEPS = List.of(

            // Reports services share the DB with their parent transactional API
            new String[]{"crm-post-sales-reports-api", "crm-post-sales-api",  "shared-database", null},
            new String[]{"crm-pre-sales-reports-api",  "crm-pre-sales-api",   "shared-database", null},

            // crm-platform-api calls crm-post-sales-api via signed internal RestClient (PostSalesCpClient)
            // and also pushes cache-evict webhooks
            new String[]{"crm-platform-api", "crm-post-sales-api", "internal-rest",
            """
            [
              {"method":"GET",  "path":"/internal/channel-partners/{cpId}/commission-summary", "description":"Fetch CP commission summary (PostSalesCpClient)"},
              {"method":"POST", "path":"/internal/channel-partners/kpi",                       "description":"Fetch CP builder KPI data"},
              {"method":"POST", "path":"/internal/channel-partners/performance",               "description":"Fetch CP performance data"},
              {"method":"GET",  "path":"/internal/channel-partners/{cpId}/bookings",           "description":"List CP bookings by date range"},
              {"method":"POST", "path":"/internal/tenants/{builderId}/provision",              "description":"Provision tenant for a builder"},
              {"method":"POST", "path":"/internal/platform/cache-evict",                      "description":"Webhook: evict cached User/Broker/CP after platform mutation"}
            ]
            """},

            // crm-platform-api pushes cache-evict webhooks to the reports service
            new String[]{"crm-platform-api", "crm-post-sales-reports-api", "webhook",
            """
            [
              {"method":"POST", "path":"/internal/platform/cache-evict", "description":"Webhook: evict cached User/Broker/CP after platform mutation"}
            ]
            """},

            // crm-post-sales-api notifies crm-pre-sales-api after booking creation (lead conversion)
            new String[]{"crm-post-sales-api", "crm-pre-sales-api", "webhook",
            """
            [
              {"method":"POST", "path":"/internal/leads/{id}/buyer-created", "description":"After booking creation, links buyer back to lead (lead conversion)"}
            ]
            """}
    );

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (String[] svc : SERVICES) {
            String name = svc[0], baseUrl = svc[1], specPath = svc[2];
            repository.findByName(name).ifPresentOrElse(
                    existing -> {
                        if (!specPath.equals(existing.getSpecPath())) {
                            existing.setSpecPath(specPath);
                            repository.save(existing);
                            log.info("Updated specPath for {} to {}", name, specPath);
                        }
                    },
                    () -> {
                        repository.save(ServiceRegistry.builder()
                                .name(name)
                                .baseUrl(baseUrl)
                                .specPath(specPath)
                                .active(true)
                                .build());
                        log.info("Seeded {} into service registry", name);
                    }
            );
        }

        seedManualDependencies();
    }

    private void seedManualDependencies() {
        for (String[] dep : MANUAL_DEPS) {
            String sourceName = dep[0], targetName = dep[1], propertyName = dep[2];
            String endpointCallsJson = dep.length > 3 && dep[3] != null ? dep[3].strip() : null;

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
                // Keep endpoint calls in sync with the authoritative MANUAL_DEPS list
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
