package io.contractsentinel.stats;

public record CallCountDto(
        long specPolls,
        long actuatorInfo,
        long actuatorEnv,
        long outboundScans,
        long samplerRuns,
        long actuatorMetrics,
        long total
) {}
