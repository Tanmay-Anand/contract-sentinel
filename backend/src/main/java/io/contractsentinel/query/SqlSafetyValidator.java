package io.contractsentinel.query;

import java.util.Arrays;
import java.util.Set;
import java.util.regex.Pattern;

public final class SqlSafetyValidator {

    private static final Pattern FORBIDDEN = Pattern.compile(
            "(?i)\\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|EXEC(?:UTE)?|CALL|MERGE|REPLACE|GRANT|REVOKE|COPY|VACUUM)\\b"
    );

    // Tokens permitted inside an EXPLAIN ( ... ) prefix. Anything else is rejected so a caller
    // cannot smuggle a second statement or option through the prefix.
    private static final Set<String> EXPLAIN_TOKENS = Set.of(
            "EXPLAIN", "ANALYZE", "VERBOSE", "COSTS", "SETTINGS", "BUFFERS", "WAL", "TIMING",
            "SUMMARY", "FORMAT", "TEXT", "JSON", "YAML", "XML", "TRUE", "FALSE", "ON", "OFF");

    private SqlSafetyValidator() {}

    /**
     * Validates that sql is a single read-only SELECT (or CTE) statement and returns it
     * with an automatic LIMIT 500 appended when the caller omitted a limit.
     */
    public static String validateAndPrepare(String rawSql) {
        return validateCore(preprocess(rawSql));
    }

    /**
     * Like {@link #validateAndPrepare} but also accepts a leading {@code EXPLAIN [(...)]} prefix.
     * The wrapped statement must still pass the full SELECT-only validation. Note that
     * {@code EXPLAIN ANALYZE} <em>executes</em> the statement â€” this is only safe because the inner
     * statement is a validated read-only SELECT (with an enforced LIMIT).
     */
    public static String validateAndPrepareAllowingExplain(String rawSql) {
        String s = preprocess(rawSql);
        if (!s.regionMatches(true, 0, "EXPLAIN", 0, "EXPLAIN".length())) {
            return validateCore(s);
        }

        int innerStart = indexOfStatementStart(s);
        if (innerStart < 0) {
            throw new IllegalArgumentException("EXPLAIN must be followed by a SELECT statement");
        }
        String prefix = s.substring(0, innerStart).trim();
        String inner = s.substring(innerStart).trim();

        assertPrefixIsPureExplain(prefix);
        String safeInner = validateCore(inner);
        return prefix + " " + safeInner;
    }

    private static String preprocess(String rawSql) {
        if (rawSql == null || rawSql.isBlank()) {
            throw new IllegalArgumentException("SQL cannot be empty");
        }
        // Strip block comments then line comments.
        String s = rawSql.replaceAll("(?s)/\\*.*?\\*/", " ");
        s = s.replaceAll("--[^\n]*", " ");
        s = s.trim();

        long nonEmptyStatements = Arrays.stream(s.split(";"))
                .map(String::trim)
                .filter(part -> !part.isBlank())
                .count();
        if (nonEmptyStatements > 1) {
            throw new IllegalArgumentException("Multiple statements are not allowed");
        }
        return s.replaceAll(";\\s*$", "").trim();
    }

    /** Validates a bare SELECT/WITH statement (already preprocessed) and appends LIMIT when absent. */
    private static String validateCore(String s) {
        if (FORBIDDEN.matcher(s).find()) {
            throw new IllegalArgumentException("Only SELECT statements are allowed");
        }
        if (!s.matches("(?is)(SELECT|WITH)\\b.*")) {
            throw new IllegalArgumentException("Only SELECT statements are allowed");
        }
        if (!s.matches("(?is).*\\bLIMIT\\s+\\d+.*")) {
            s = s + "\nLIMIT 500";
        }
        return s;
    }

    private static int indexOfStatementStart(String s) {
        var matcher = Pattern.compile("(?i)\\b(SELECT|WITH)\\b").matcher(s);
        return matcher.find() ? matcher.start() : -1;
    }

    private static void assertPrefixIsPureExplain(String prefix) {
        // Keep only word tokens; punctuation like ( ) , is allowed structurally.
        String words = prefix.replaceAll("[(),]", " ");
        for (String token : words.split("\\s+")) {
            if (token.isBlank()) continue;
            if (!EXPLAIN_TOKENS.contains(token.toUpperCase())) {
                throw new IllegalArgumentException("Unsupported EXPLAIN option: " + token);
            }
        }
    }
}
