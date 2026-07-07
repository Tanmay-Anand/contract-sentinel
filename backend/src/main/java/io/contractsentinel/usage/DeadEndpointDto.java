package io.contractsentinel.usage;

import java.time.Instant;

public record DeadEndpointDto(
        String httpMethod,
        String path,
        long lastSeenCount,
        int consecutiveZeroSamples,
        Instant lastSampledAt
) {
}
