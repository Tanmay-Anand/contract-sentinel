package io.contractsentinel.query;

public record FilterClause(
        String column,
        String operator,
        String value
) {
    /** Operators the IR compiler recognises. */
    public static final java.util.Set<String> VALID_OPERATORS = java.util.Set.of(
            "=", "!=", "<", ">", "<=", ">=", "LIKE", "ILIKE", "IN", "IS NULL", "IS NOT NULL"
    );
}
