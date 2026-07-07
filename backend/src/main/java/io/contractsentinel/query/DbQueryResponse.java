package io.contractsentinel.query;

import java.util.List;

public record DbQueryResponse(
        List<String> columns,
        List<List<Object>> rows,
        int rowCount,
        long executionMs
) {}

