package io.contractsentinel.trace;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.Map;

/**
 * Incoming Zipkin v2 JSON span (as emitted by the Brave zipkin reporter). Only the fields we use
 * are declared; everything else is ignored so exporter/version differences never break ingestion.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ZipkinSpanDto(
        String traceId,
        String id,
        String parentId,
        String name,
        String kind,
        Long timestamp,
        Long duration,
        Endpoint localEndpoint,
        Map<String, String> tags
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Endpoint(String serviceName) {}
}
