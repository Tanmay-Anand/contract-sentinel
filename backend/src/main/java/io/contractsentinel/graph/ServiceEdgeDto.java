package io.contractsentinel.graph;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public record ServiceEdgeDto(
        UUID id,
        UUID sourceId,
        String sourceName,
        UUID targetId,
        String targetName,
        String detectionMethod,
        String propertyName,
        String confidence,
        Instant verifiedAt,
        Instant scanFailedAt,
        boolean stale,
        List<EndpointCall> endpointCalls,
        Double avgLatencyMs,
        String latencyBand
) {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public record EndpointCall(String method, String path, String description) {}

    public static ServiceEdgeDto from(ServiceDependency d) {
        List<EndpointCall> calls = Collections.emptyList();
        if (d.getEndpointCallsJson() != null && !d.getEndpointCallsJson().isBlank()) {
            try {
                calls = MAPPER.readValue(d.getEndpointCallsJson(), new TypeReference<>() {});
            } catch (Exception ignored) {}
        }
        return new ServiceEdgeDto(
                d.getId(),
                d.getSourceService().getId(),
                d.getSourceService().getName(),
                d.getTargetService().getId(),
                d.getTargetService().getName(),
                d.getDetectionMethod().name(),
                d.getPropertyName(),
                d.getConfidence().name(),
                d.getVerifiedAt(),
                d.getScanFailedAt(),
                d.isStale(),
                calls,
                null,
                null
        );
    }

    /** Returns a copy of this edge annotated with observed inter-service round-trip latency. */
    public ServiceEdgeDto withLatency(Double ms, String band) {
        return new ServiceEdgeDto(id, sourceId, sourceName, targetId, targetName, detectionMethod,
                propertyName, confidence, verifiedAt, scanFailedAt, stale, endpointCalls, ms, band);
    }
}
