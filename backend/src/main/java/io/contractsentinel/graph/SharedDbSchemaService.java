package io.contractsentinel.graph;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.sql.*;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class SharedDbSchemaService {

    private final ServiceDependencyRepository dependencyRepository;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    public List<TableSchemaDto> getSchemaForEdge(UUID edgeId) {
        ServiceDependency edge = dependencyRepository.findById(edgeId)
                .orElseThrow(() -> new NoSuchElementException("Edge not found: " + edgeId));

        if (!"shared-database".equals(edge.getPropertyName())) {
            throw new IllegalArgumentException("Edge is not a shared-database dependency");
        }

        ServiceRegistry target = edge.getTargetService();
        try {
            DatasourceConfig config = readDatasourceConfig(target);
            return querySchema(config);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException(
                    "Could not read schema from " + target.getName() + ": " + e.getMessage(), e);
        }
    }

    public List<DbSchemaGroupDto> getDbGraph() {
        // Introspect every active service's database, not just shared-database edge targets, so
        // services that own their own DB (e.g. service-e, reached only over REST) still appear.
        // De-duplicate by JDBC URL: services that genuinely share one physical DB (e.g. a reports
        // service pointing at its parent's DB) collapse into a single group. Sorting by name makes the
        // owning service (service-a before service-c) win the group name deterministically.
        List<ServiceRegistry> services = serviceRegistryRepository.findAllByActiveTrue().stream()
                .sorted(Comparator.comparing(ServiceRegistry::getName))
                .toList();

        Set<String> seenUrls = new HashSet<>();
        List<DbSchemaGroupDto> result = new ArrayList<>();
        for (ServiceRegistry service : services) {
            try {
                DatasourceConfig config = readDatasourceConfig(service);
                if (!seenUrls.add(config.url())) {
                    continue; // this physical database is already represented by another service
                }
                List<TableSchemaDto> tables = querySchema(config);
                List<ForeignKeyDto> fks = queryForeignKeys(config);
                result.add(new DbSchemaGroupDto(service.getName(), tables, fks));
            } catch (Exception e) {
                log.warn("Could not query schema for {}: {}", service.getName(), e.getMessage());
            }
        }
        return result;
    }

    private List<ForeignKeyDto> queryForeignKeys(DatasourceConfig cfg) {
        List<ForeignKeyDto> fks = new ArrayList<>();
        String sql = """
                SELECT
                    kcu.table_name  AS from_table,
                    kcu.column_name AS from_column,
                    ccu.table_name  AS to_table,
                    ccu.column_name AS to_column
                FROM information_schema.key_column_usage kcu
                JOIN information_schema.referential_constraints rc
                    ON rc.constraint_name  = kcu.constraint_name
                   AND rc.constraint_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name  = rc.unique_constraint_name
                   AND ccu.table_schema     = rc.unique_constraint_schema
                WHERE kcu.table_schema = 'crm'
                ORDER BY kcu.table_name, kcu.column_name
                """;
        try (Connection conn = DriverManager.getConnection(cfg.url(), cfg.username(), cfg.password());
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                fks.add(new ForeignKeyDto(
                        rs.getString("from_table"),
                        rs.getString("from_column"),
                        rs.getString("to_table"),
                        rs.getString("to_column")
                ));
            }
        } catch (SQLException e) {
            log.warn("FK query failed for {}: {}", cfg.url(), e.getMessage());
        }
        return fks;
    }

    public DatasourceConfig readDatasourceConfig(ServiceRegistry service) {
        String contextPath = contextPathFrom(service.getSpecPath());
        String envUrl = service.getBaseUrl() + contextPath + "/actuator/env";

        try {
            String json = restClient.get().uri(envUrl).retrieve().body(String.class);
            Map<String, Object> root = objectMapper.readValue(json, new TypeReference<>() {});

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> sources = (List<Map<String, Object>>) root.get("propertySources");
            Map<String, String> flat = flattenEnv(sources);

            String url = firstNonNull(flat,
                    "spring.datasource.url",
                    "spring.datasource.hikari.jdbc-url");
            String username = firstNonNull(flat,
                    "spring.datasource.username",
                    "spring.datasource.hikari.username");
            String password = firstNonNull(flat,
                    "spring.datasource.password",
                    "spring.datasource.hikari.password");

            if (url == null) throw new IllegalStateException("No datasource URL found in env for " + service.getName());
            return new DatasourceConfig(url, username, password);

        } catch (Exception e) {
            throw new RuntimeException("Could not read datasource config from " + service.getName() + ": " + e.getMessage(), e);
        }
    }

    private List<TableSchemaDto> querySchema(DatasourceConfig cfg) {
        Map<String, List<ColumnDto>> tableMap = new LinkedHashMap<>();

        try (Connection conn = DriverManager.getConnection(cfg.url(), cfg.username(), cfg.password())) {
            String sql = """
                    SELECT table_name, column_name, data_type, is_nullable, ordinal_position
                    FROM information_schema.columns
                    WHERE table_schema = 'crm'
                    ORDER BY table_name, ordinal_position
                    """;
            try (PreparedStatement ps = conn.prepareStatement(sql);
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String table = rs.getString("table_name");
                    String col = rs.getString("column_name");
                    String type = rs.getString("data_type");
                    boolean nullable = "YES".equalsIgnoreCase(rs.getString("is_nullable"));
                    tableMap.computeIfAbsent(table, k -> new ArrayList<>()).add(new ColumnDto(col, type, nullable));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Database schema query failed: " + e.getMessage(), e);
        }

        return tableMap.entrySet().stream()
                .map(e -> new TableSchemaDto(e.getKey(), e.getValue()))
                .toList();
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> flattenEnv(List<Map<String, Object>> sources) {
        Map<String, String> flat = new LinkedHashMap<>();
        if (sources == null) return flat;
        for (Map<String, Object> source : sources) {
            Map<String, Object> props = (Map<String, Object>) source.get("properties");
            if (props == null) continue;
            for (Map.Entry<String, Object> entry : props.entrySet()) {
                if (flat.containsKey(entry.getKey())) continue;
                Object val = entry.getValue();
                if (val instanceof Map valMap) {
                    Object v = valMap.get("value");
                    if (v instanceof String s) flat.put(entry.getKey(), s);
                }
            }
        }
        return flat;
    }

    private String firstNonNull(Map<String, String> map, String... keys) {
        for (String key : keys) {
            String val = map.get(key);
            if (val != null && !val.isBlank()) return val;
        }
        return null;
    }

    private String contextPathFrom(String specPath) {
        if (specPath == null) return "";
        int idx = specPath.lastIndexOf("/v3/api-docs");
        if (idx <= 0) return "";
        return specPath.substring(0, idx);
    }

    public record DatasourceConfig(String url, String username, String password) {}

    public record TableSchemaDto(String tableName, List<ColumnDto> columns) {}

    public record ColumnDto(String name, String type, boolean nullable) {}

    public record ForeignKeyDto(String fromTable, String fromColumn, String toTable, String toColumn) {}

    public record DbSchemaGroupDto(String serviceGroupName, List<TableSchemaDto> tables, List<ForeignKeyDto> foreignKeys) {}
}
