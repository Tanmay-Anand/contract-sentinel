package io.contractsentinel.graph;

import io.contractsentinel.registry.ServiceRegistry;

import java.util.UUID;

public record ServiceNodeDto(
        UUID id,
        String name,
        String baseUrl,
        String status,
        int breakingChanges,
        boolean hasStaleEdges
) {
    public static ServiceNodeDto from(ServiceRegistry svc, String status, int breakingChanges, boolean hasStaleEdges) {
        return new ServiceNodeDto(
                svc.getId(),
                svc.getName(),
                svc.getBaseUrl(),
                status,
                breakingChanges,
                hasStaleEdges
        );
    }
}
