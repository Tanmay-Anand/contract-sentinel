package io.contractsentinel.sampler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public record SamplingResultDto(
        UUID id,
        UUID endpointId,
        Instant sampledAt,
        int httpStatus,
        List<String> actualFields,
        List<String> specFields,
        List<String> undocumentedFields,
        List<String> missingFields,
        int matchScore
) {
    private static final TypeReference<List<String>> LIST_TYPE = new TypeReference<>() {};

    public static SamplingResultDto from(SamplingResult r, ObjectMapper om) {
        return new SamplingResultDto(
                r.getId(),
                r.getEndpoint().getId(),
                r.getSampledAt(),
                r.getHttpStatus(),
                parseList(r.getActualFields(), om),
                parseList(r.getSpecFields(), om),
                parseList(r.getUndocumentedFields(), om),
                parseList(r.getMissingFields(), om),
                r.getMatchScore()
        );
    }

    private static List<String> parseList(String json, ObjectMapper om) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return om.readValue(json, LIST_TYPE);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }
}
