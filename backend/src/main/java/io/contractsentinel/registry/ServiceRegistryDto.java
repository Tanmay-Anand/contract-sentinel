package io.contractsentinel.registry;

import java.time.Instant;
import java.util.UUID;

public record ServiceRegistryDto(
        UUID id,
        String name,
        String baseUrl,
        String specPath,
        boolean active,
        Instant createdAt,
        String status,
        long breakingDriftCount,
        Integer healthScore
) {
    public static ServiceRegistryDto from(ServiceRegistry s) {
        return new ServiceRegistryDto(s.getId(), s.getName(), s.getBaseUrl(),
                s.getSpecPath(), s.isActive(), s.getCreatedAt(), "UNKNOWN", 0, null);
    }

    public static ServiceRegistryDto from(ServiceRegistry s, String status, long breakingCount) {
        return new ServiceRegistryDto(s.getId(), s.getName(), s.getBaseUrl(),
                s.getSpecPath(), s.isActive(), s.getCreatedAt(), status, breakingCount,
                computeHealthScore(status, breakingCount));
    }

    private static Integer computeHealthScore(String status, long breakingCount) {
        if ("UNKNOWN".equals(status)) return null;
        int score = 100;
        if ("UNREACHABLE".equals(status)) score -= 30;
        else if ("PARSE_FAILED".equals(status)) score -= 10;
        score -= (int) Math.min(breakingCount * 20L, 80L);
        return Math.max(0, score);
    }
}
