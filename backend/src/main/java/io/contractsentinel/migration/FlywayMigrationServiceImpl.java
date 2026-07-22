package io.contractsentinel.migration;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import io.contractsentinel.registry.ServiceRegistry;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.File;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class FlywayMigrationServiceImpl implements FlywayMigrationService {

    private static final String SOURCE_ACTUATOR = "ACTUATOR";
    private static final String SOURCE_FILESYSTEM = "FILESYSTEM";
    private static final String STATE_FILESYSTEM_ONLY = "FILESYSTEM_ONLY";

    /** Matches Flyway versioned migration filenames: V1__desc.sql, V1.2.3__desc.sql */
    private static final Pattern VERSIONED = Pattern.compile(
            "(?i)^V(\\d+(?:[._]\\d+)*)__(.+)\\.sql$");
    /** Matches repeatable migration filenames: R__desc.sql */
    private static final Pattern REPEATABLE = Pattern.compile(
            "(?i)^R__(.+)\\.sql$");

    private final CsMigrationRecordRepository repository;
    private final ObjectMapper objectMapper;
    private final Environment environment;

    /**
     * Per-service directory paths configured in application.yaml under
     * {@code sentinel.flyway.migration-dirs}. Key = service name as stored in
     * {@code cs_service_registry.name}. Absent keys mean no filesystem scan for that service.
     * Bound via {@link Binder} because a nested YAML map cannot be resolved through a
     * {@code ${...}} placeholder.
     */
    private Map<String, String> migrationDirs = Map.of();

    @PostConstruct
    void bindMigrationDirs() {
        migrationDirs = Binder.get(environment)
                .bind("sentinel.flyway.migration-dirs", Bindable.mapOf(String.class, String.class))
                .orElse(Map.of());
        log.info("Flyway filesystem scan configured for {} service(s)", migrationDirs.size());
    }

    private final RestClient restClient = RestClient.builder()
            .requestFactory(withReadTimeout(
                    new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                            .connectTimeout(Duration.ofSeconds(5))
                            .build()),
                    Duration.ofSeconds(10)))
            .build();

    private static JdkClientHttpRequestFactory withReadTimeout(JdkClientHttpRequestFactory f, Duration d) {
        f.setReadTimeout(d);
        return f;
    }

    @Override
    @Transactional
    public void syncFromActuator(ServiceRegistry service) {
        String contextPath = contextPathFrom(service.getSpecPath());
        String url = service.getBaseUrl() + contextPath + "/actuator/flyway";
        try {
            String json = restClient.get().uri(url).retrieve().body(String.class);
            if (json == null || json.isBlank()) return;

            JsonNode root = objectMapper.readTree(json);
            JsonNode migrations = findMigrationsArray(root);
            if (migrations == null || !migrations.isArray()) {
                log.debug("No migrations array in actuator response from {}", service.getName());
                return;
            }

            Instant now = Instant.now();
            for (JsonNode m : migrations) {
                String script = text(m, "script");
                if (script == null) continue;

                CsMigrationRecord record = repository
                        .findByServiceIdAndScript(service.getId(), script)
                        .orElseGet(CsMigrationRecord::new);

                record.setServiceId(service.getId());
                record.setServiceName(service.getName());
                record.setScript(script);
                record.setVersion(text(m, "version"));
                record.setDescription(text(m, "description"));
                record.setType(text(m, "type"));
                record.setState(text(m, "state") != null ? text(m, "state") : "UNKNOWN");
                record.setSource(SOURCE_ACTUATOR);
                record.setSnapshotAt(now);

                if (m.has("checksum") && !m.get("checksum").isNull()) {
                    record.setChecksum(m.get("checksum").intValue());
                }
                if (m.has("installedOn") && !m.get("installedOn").isNull()) {
                    try {
                        record.setInstalledOn(Instant.parse(m.get("installedOn").asText()));
                    } catch (Exception ignored) {}
                }
                if (m.has("installedBy") && !m.get("installedBy").isNull()) {
                    record.setInstalledBy(m.get("installedBy").asText());
                }
                if (m.has("executionTime") && !m.get("executionTime").isNull()) {
                    record.setExecutionTime(m.get("executionTime").intValue());
                }
                repository.save(record);
            }
            log.debug("Flyway sync from actuator complete for {} ({} migrations)",
                    service.getName(), migrations.size());
        } catch (Exception e) {
            log.debug("Could not fetch /actuator/flyway from {}: {}", service.getName(), e.getMessage());
        }
    }

    @Override
    @Transactional
    public void syncFromFilesystem(ServiceRegistry service) {
        String dir = migrationDirs.get(service.getName());
        if (dir == null || dir.isBlank()) return;

        File migrationDir = new File(dir);
        if (!migrationDir.isDirectory()) {
            log.warn("Configured migrationDir for {} is not a directory: {}", service.getName(), dir);
            return;
        }

        File[] files = migrationDir.listFiles(f -> f.isFile() && f.getName().toLowerCase().endsWith(".sql"));
        if (files == null) return;

        Instant now = Instant.now();
        int newCount = 0;
        for (File file : files) {
            String filename = file.getName();
            String version = null;
            String description = null;
            String type = "SQL";

            Matcher vm = VERSIONED.matcher(filename);
            Matcher rm = REPEATABLE.matcher(filename);
            if (vm.matches()) {
                version = vm.group(1);
                description = vm.group(2).replace('_', ' ');
            } else if (rm.matches()) {
                description = rm.group(1).replace('_', ' ');
                type = "SQL";
            } else {
                continue;
            }

            // Only insert if not already known from the actuator
            Optional<CsMigrationRecord> existing = repository
                    .findByServiceIdAndScript(service.getId(), filename);
            if (existing.isPresent() && SOURCE_ACTUATOR.equals(existing.get().getSource())) {
                continue; // actuator already tracks this — don't downgrade
            }
            if (existing.isEmpty()) {
                CsMigrationRecord record = CsMigrationRecord.builder()
                        .serviceId(service.getId())
                        .serviceName(service.getName())
                        .script(filename)
                        .version(version)
                        .description(description)
                        .type(type)
                        .state(STATE_FILESYSTEM_ONLY)
                        .source(SOURCE_FILESYSTEM)
                        .snapshotAt(now)
                        .build();
                repository.save(record);
                newCount++;
            }
        }
        if (newCount > 0) {
            log.info("Filesystem scan found {} new migration script(s) not yet loaded by {} JVM",
                    newCount, service.getName());
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<FlywayServiceSummaryDto> getAllSummaries() {
        List<Object[]> serviceRows = repository.findDistinctServiceIdAndName();
        List<UUID> servicesWithIssues = repository.findServicesWithIssues();
        Set<UUID> issueSet = new HashSet<>(servicesWithIssues);

        List<FlywayServiceSummaryDto> summaries = new ArrayList<>();
        for (Object[] row : serviceRows) {
            UUID serviceId = (UUID) row[0];
            String serviceName = (String) row[1];

            Map<String, Long> counts = new HashMap<>();
            for (Object[] stateRow : repository.countByStateForService(serviceId)) {
                counts.put((String) stateRow[0], (Long) stateRow[1]);
            }

            summaries.add(new FlywayServiceSummaryDto(
                    serviceId,
                    serviceName,
                    counts.getOrDefault("SUCCESS", 0L).intValue(),
                    counts.getOrDefault("PENDING", 0L).intValue(),
                    (int) (counts.getOrDefault("FAILED", 0L) + counts.getOrDefault("MISSING_FAILED", 0L)),
                    counts.getOrDefault("OUT_OF_ORDER", 0L).intValue(),
                    counts.getOrDefault(STATE_FILESYSTEM_ONLY, 0L).intValue(),
                    counts.getOrDefault("MISSING_SUCCESS", 0L).intValue(),
                    issueSet.contains(serviceId)));
        }
        return summaries;
    }

    @Override
    @Transactional(readOnly = true)
    public List<FlywayMigrationRecordDto> getMigrations(UUID serviceId, String stateFilter) {
        List<CsMigrationRecord> records = stateFilter != null && !stateFilter.isBlank()
                ? repository.findByServiceIdAndStateOrderByVersionAsc(serviceId, stateFilter.toUpperCase())
                : repository.findByServiceIdOrderByVersionAsc(serviceId);
        return records.stream().map(FlywayMigrationRecordDto::from).toList();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static String contextPathFrom(String specPath) {
        if (specPath == null) return "";
        int idx = specPath.lastIndexOf("/v3/api-docs");
        return idx > 0 ? specPath.substring(0, idx) : "";
    }

    /**
     * Spring Boot actuator nests migrations under:
     * contexts → {contextName} → flywayBeans → {beanName} → migrations
     */
    private static JsonNode findMigrationsArray(JsonNode root) {
        JsonNode contexts = root.get("contexts");
        if (contexts == null) return null;
        for (JsonNode ctx : contexts) {
            JsonNode beans = ctx.get("flywayBeans");
            if (beans == null) continue;
            for (JsonNode bean : beans) {
                JsonNode migrations = bean.get("migrations");
                if (migrations != null && migrations.isArray()) return migrations;
            }
        }
        return null;
    }

    private static String text(JsonNode node, String field) {
        JsonNode n = node.get(field);
        return (n != null && !n.isNull()) ? n.asText() : null;
    }
}
