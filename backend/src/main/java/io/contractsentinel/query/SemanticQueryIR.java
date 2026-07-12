package io.contractsentinel.query;

import java.util.List;

/**
 * Typed intermediate representation that the LLM fills in JSON form.
 * Deterministic Java code (SemanticQueryValidator + IrToSqlCompiler) handles
 * the actual validation and SQL generation â€” no free-form NLâ†’SQL.
 */
public record SemanticQueryIR(
        String intent,
        String targetTable,
        String serviceName,
        List<String> selectColumns,
        List<FilterClause> filters,
        String orderByColumn,
        String orderDirection,
        Integer limitCount,
        String metricName
) {
    public enum Intent {SELECT, COUNT, AGGREGATE, METRIC}

    public static final String IR_SCHEMA = """
            {
              "intent": "SELECT | COUNT | AGGREGATE | METRIC",
              "targetTable": "exact table name from schema (e.g. booking)",
              "serviceName": "service name (e.g. crm-post-sales-api)",
              "selectColumns": ["col1", "col2"] or ["*"],
              "filters": [
                {"column": "status", "operator": "=", "value": "CONFIRMED"}
              ],
              "orderByColumn": "created_at or null",
              "orderDirection": "ASC or DESC or null",
              "limitCount": 50,
              "metricName": "pre-defined metric name or null"
            }
            """;
}
