package io.contractsentinel.trace;

/** One row in the trace list: the root of a request chain plus roll-up stats. */
public record TraceSummaryDto(
        String traceId,
        String rootName,
        String entryService,
        long totalDurationMicros,
        int spanCount,
        boolean hasError,
        long startEpochMicros
) {}
