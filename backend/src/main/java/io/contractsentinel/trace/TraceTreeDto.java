package io.contractsentinel.trace;

import java.util.List;

/**
 * An assembled trace for the waterfall view: spans flattened into depth-first order, each carrying
 * its depth and its offset from the trace start so the UI can position bars without re-deriving the
 * tree.
 */
public record TraceTreeDto(
        String traceId,
        String rootName,
        long totalDurationMicros,
        long startEpochMicros,
        List<SpanNode> spans
) {
    public record SpanNode(
            String spanId,
            String parentSpanId,
            String serviceName,
            String name,
            String kind,
            int depth,
            long offsetMicros,
            long durationMicros,
            String httpMethod,
            String httpPath,
            Integer httpStatus
    ) {}
}
