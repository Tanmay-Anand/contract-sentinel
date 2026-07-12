package io.contractsentinel.query;

import io.contractsentinel.graph.SharedDbSchemaService;
import io.contractsentinel.knowledge.GraphMetricRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class SemanticQueryValidator {

    private final SharedDbSchemaService schemaService;
    private final GraphMetricRepository metricRepo;

    public IrValidationResult validate(SemanticQueryIR ir) {
        List<String> errors = new ArrayList<>();

        if (ir == null) {
            return IrValidationResult.fail(List.of("IR is null"));
        }

        // METRIC intent: just check the metric exists
        if ("METRIC".equalsIgnoreCase(ir.intent())) {
            if (ir.metricName() == null || ir.metricName().isBlank()) {
                errors.add("metricName is required for METRIC intent");
            } else if (!metricRepo.existsByNameIgnoreCase(ir.metricName())) {
                errors.add("Unknown metric: '" + ir.metricName() + "'");
            }
            return errors.isEmpty() ? IrValidationResult.ok() : IrValidationResult.fail(errors);
        }

        // Validate intent
        if (ir.intent() == null || ir.intent().isBlank()) {
            errors.add("intent is required");
        } else {
            try {
                SemanticQueryIR.Intent.valueOf(ir.intent().toUpperCase());
            } catch (IllegalArgumentException e) {
                errors.add("Unknown intent '" + ir.intent() + "'; must be SELECT, COUNT, AGGREGATE, or METRIC");
            }
        }

        // Validate table exists
        if (ir.targetTable() == null || ir.targetTable().isBlank()) {
            errors.add("targetTable is required");
        } else {
            Set<String> knownTables = getKnownTables(ir.serviceName());
            if (!knownTables.isEmpty() && !knownTables.contains(ir.targetTable().toLowerCase())) {
                errors.add("Unknown table '" + ir.targetTable() + "'; known tables: " + knownTables);
            }
        }

        // If we already know the table, validate columns
        if (ir.targetTable() != null && !ir.targetTable().isBlank()) {
            Set<String> knownColumns = getKnownColumns(ir.serviceName(), ir.targetTable());
            if (!knownColumns.isEmpty()) {
                // selectColumns
                if (ir.selectColumns() != null) {
                    for (String col : ir.selectColumns()) {
                        if (!"*".equals(col) && !knownColumns.contains(col.toLowerCase())) {
                            errors.add("Unknown select column '" + col + "'");
                        }
                    }
                }
                // filter columns
                if (ir.filters() != null) {
                    for (FilterClause f : ir.filters()) {
                        if (f.column() == null || f.column().isBlank()) {
                            errors.add("Filter has blank column");
                            continue;
                        }
                        if (!knownColumns.contains(f.column().toLowerCase())) {
                            errors.add("Unknown filter column '" + f.column() + "'");
                        }
                        if (f.operator() == null || !FilterClause.VALID_OPERATORS.contains(f.operator().toUpperCase())) {
                            errors.add("Invalid filter operator '" + f.operator() + "'");
                        }
                    }
                }
                // orderBy column
                if (ir.orderByColumn() != null && !ir.orderByColumn().isBlank()
                        && !knownColumns.contains(ir.orderByColumn().toLowerCase())) {
                    errors.add("Unknown orderByColumn '" + ir.orderByColumn() + "'");
                }
            }
        }

        return errors.isEmpty() ? IrValidationResult.ok() : IrValidationResult.fail(errors);
    }

    // â”€â”€ Schema helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private Set<String> getKnownTables(String serviceName) {
        try {
            return schemaService.getDbGraph().stream()
                    .filter(g -> serviceName == null || serviceName.isBlank()
                            || g.serviceGroupName().equalsIgnoreCase(serviceName))
                    .flatMap(g -> g.tables().stream())
                    .map(t -> t.tableName().toLowerCase())
                    .collect(Collectors.toSet());
        } catch (Exception e) {
            return Set.of();
        }
    }

    private Set<String> getKnownColumns(String serviceName, String tableName) {
        try {
            return schemaService.getDbGraph().stream()
                    .filter(g -> serviceName == null || serviceName.isBlank()
                            || g.serviceGroupName().equalsIgnoreCase(serviceName))
                    .flatMap(g -> g.tables().stream())
                    .filter(t -> t.tableName().equalsIgnoreCase(tableName))
                    .flatMap(t -> t.columns().stream())
                    .map(c -> c.name().toLowerCase())
                    .collect(Collectors.toSet());
        } catch (Exception e) {
            return Set.of();
        }
    }
}
