package io.contractsentinel.usage;

import java.time.Instant;

public record UsageEntryDto(
        String httpMethod,
        String path,
        long totalCount,
        long deltaCount,
        Instant sampledAt,
        boolean isDead
) {
    public static UsageEntryDto from(EndpointUsageSample s, boolean isDead) {
        return new UsageEntryDto(
                s.getHttpMethod(),
                s.getPath(),
                s.getTotalCount(),
                s.getDeltaCount(),
                s.getSampledAt(),
                isDead
        );
    }
}
