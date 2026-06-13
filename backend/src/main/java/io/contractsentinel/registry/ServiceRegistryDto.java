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
        long breakingDriftCount
) {
    public static ServiceRegistryDto from(ServiceRegistry s) {
        return new ServiceRegistryDto(s.getId(), s.getName(), s.getBaseUrl(),
                s.getSpecPath(), s.isActive(), s.getCreatedAt(), "UNKNOWN", 0);
    }

    public static ServiceRegistryDto from(ServiceRegistry s, String status, long breakingCount) {
        return new ServiceRegistryDto(s.getId(), s.getName(), s.getBaseUrl(),
                s.getSpecPath(), s.isActive(), s.getCreatedAt(), status, breakingCount);
    }
}
