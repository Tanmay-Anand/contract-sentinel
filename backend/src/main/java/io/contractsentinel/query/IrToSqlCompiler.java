package io.contractsentinel.query;

import io.contractsentinel.knowledge.GraphMetricRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class IrToSqlCompiler {

    private final GraphMetricRepository metricRepo;

    /**
     * Compiles a validated {@link SemanticQueryIR} to a safe read-only SQL string.
     * Throws {@link IllegalArgumentException} for any unresolvable reference â€”
     * the caller should treat these as internal errors (validation should have caught them first).
     */
    public String compile(SemanticQueryIR ir) {
        if ("METRIC".equalsIgnoreCase(ir.intent())) {
            return compileMetric(ir.metricName());
        }
        return compileSelect(ir);
    }

    private String compileMetric(String metricName) {
        return metricRepo.findByNameIgnoreCase(metricName)
                .map(m -> m.getSqlDefinition().trim())
                .orElseThrow(() -> new IllegalArgumentException("Metric not found: " + metricName));
    }

    private String compileSelect(SemanticQueryIR ir) {
        StringBuilder sql = new StringBuilder();

        // SELECT clause
        String intent = ir.intent() == null ? "SELECT" : ir.intent().toUpperCase();
        switch (intent) {
            case "COUNT" -> sql.append("SELECT COUNT(*)");
            case "AGGREGATE" -> {
                // fall back to a reasonable aggregate over first numeric-sounding column
                String cols = selectList(ir.selectColumns());
                sql.append("SELECT ").append(cols);
            }
            default -> sql.append("SELECT ").append(selectList(ir.selectColumns()));
        }

        // FROM clause
        sql.append(" FROM ").append(quote(ir.targetTable()));

        // WHERE clause
        List<FilterClause> filters = ir.filters();
        if (filters != null && !filters.isEmpty()) {
            String where = filters.stream()
                    .map(this::compileFilter)
                    .collect(Collectors.joining(" AND "));
            sql.append(" WHERE ").append(where);
        }

        // ORDER BY
        if (ir.orderByColumn() != null && !ir.orderByColumn().isBlank()) {
            String dir = "DESC".equalsIgnoreCase(ir.orderDirection()) ? "DESC" : "ASC";
            sql.append(" ORDER BY ").append(quote(ir.orderByColumn())).append(" ").append(dir);
        }

        // LIMIT (cap at 500 to match DbQueryServiceImpl's row cap)
        int limit = (ir.limitCount() != null && ir.limitCount() > 0)
                ? Math.min(ir.limitCount(), 500) : 100;
        sql.append(" LIMIT ").append(limit);

        return sql.toString();
    }

    private String selectList(List<String> cols) {
        if (cols == null || cols.isEmpty() || (cols.size() == 1 && "*".equals(cols.get(0)))) {
            return "*";
        }
        return cols.stream().map(this::quote).collect(Collectors.joining(", "));
    }

    private String compileFilter(FilterClause f) {
        String col = quote(f.column());
        String op = f.operator().toUpperCase();
        return switch (op) {
            case "IS NULL" -> col + " IS NULL";
            case "IS NOT NULL" -> col + " IS NOT NULL";
            case "IN" -> col + " IN (" + sanitiseInList(f.value()) + ")";
            case "LIKE", "ILIKE" -> col + " " + op + " " + literal(f.value());
            default -> col + " " + op + " " + literal(f.value());
        };
    }

    /** Quote an identifier safely â€” strip anything that isn't alphanumeric or underscore. */
    private String quote(String identifier) {
        String safe = identifier.replaceAll("[^a-zA-Z0-9_]", "");
        return "\"" + safe + "\"";
    }

    /** Produce a string literal (single-quoted, inner single quotes escaped). */
    private String literal(String val) {
        if (val == null) return "NULL";
        return "'" + val.replace("'", "''") + "'";
    }

    /** Sanitise a comma-separated IN list â€” each element becomes a quoted literal. */
    private String sanitiseInList(String raw) {
        if (raw == null || raw.isBlank()) return "''";;
        String[] parts = raw.split(",");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append(literal(parts[i].trim()));
        }
        return sb.toString();
    }
}
