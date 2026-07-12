package io.contractsentinel.latency;

import java.time.Instant;
import java.util.UUID;

public record LatencyMetricDto(
        UUID id,
        UUID serviceId,
        Instant recordedAt,
        Long specFetchMs,
        Double p50Ms,
        Double p95Ms,
        Double p99Ms,
        Long requestCount,
        String source,
        String dominantEndpointMethod,
        String dominantEndpointPath
) {
    public static LatencyMetricDto from(LatencyMetric m) {
        return new LatencyMetricDto(
                m.getId(),
                m.getService().getId(),
                m.getRecordedAt(),
                m.getSpecFetchMs(),
                m.getP50Ms(),
                m.getP95Ms(),
                m.getP99Ms(),
                m.getRequestCount(),
                m.getSource().name(),
                m.getDominantEndpointMethod(),
                m.getDominantEndpointPath()
        );
    }
}
