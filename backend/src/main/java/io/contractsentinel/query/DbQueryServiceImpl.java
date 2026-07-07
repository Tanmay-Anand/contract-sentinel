package io.contractsentinel.query;

import io.contractsentinel.graph.SharedDbSchemaService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.sql.*;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class DbQueryServiceImpl implements DbQueryService {

    private final ServiceRegistryRepository serviceRegistryRepository;
    private final SharedDbSchemaService sharedDbSchemaService;

    @Override
    public DbQueryResponse execute(UUID serviceId, String sql) {
        return run(serviceId, SqlSafetyValidator.validateAndPrepare(sql));
    }

    @Override
    public DbQueryResponse explain(UUID serviceId, String sql) {
        return run(serviceId, SqlSafetyValidator.validateAndPrepareAllowingExplain(sql));
    }

    private DbQueryResponse run(UUID serviceId, String safeSql) {
        ServiceRegistry registry = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> new IllegalArgumentException("Service not found: " + serviceId));

        SharedDbSchemaService.DatasourceConfig cfg;
        try {
            cfg = sharedDbSchemaService.readDatasourceConfig(registry);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException(
                    "Could not resolve datasource for service '" + registry.getName() + "': " + e.getMessage(), e);
        }

        long start = System.currentTimeMillis();
        try (Connection conn = DriverManager.getConnection(cfg.url(), cfg.username(), cfg.password());
             PreparedStatement ps = conn.prepareStatement(safeSql);
             ResultSet rs = ps.executeQuery()) {

            ResultSetMetaData meta = rs.getMetaData();
            int colCount = meta.getColumnCount();

            List<String> columns = new ArrayList<>(colCount);
            for (int i = 1; i <= colCount; i++) {
                columns.add(meta.getColumnLabel(i));
            }

            List<List<Object>> rows = new ArrayList<>();
            while (rs.next() && rows.size() < 500) {
                List<Object> row = new ArrayList<>(colCount);
                for (int i = 1; i <= colCount; i++) {
                    row.add(rs.getObject(i));
                }
                rows.add(row);
            }

            long executionMs = System.currentTimeMillis() - start;
            log.debug("Query on {} completed in {}ms, {} rows", registry.getName(), executionMs, rows.size());
            return new DbQueryResponse(columns, rows, rows.size(), executionMs);

        } catch (SQLException e) {
            throw new IllegalArgumentException(e.getMessage(), e);
        }
    }
}
