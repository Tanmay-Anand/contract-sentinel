package io.contractsentinel.query;

import java.util.List;

public record NlQueryResponse(
        String question,
        String compiledSql,
        SemanticQueryIR ir,
        List<String> columns,
        List<List<Object>> rows,
        int rowCount,
        long executionMs,
        long totalMs,
        int llmAttempts,
        List<String> synonymsApplied
) {}
