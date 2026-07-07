package io.contractsentinel.sampler;

import java.time.Instant;
import java.util.UUID;

public record SampledEndpointDto(
        UUID id,
        UUID serviceId,
        String serviceName,
        String httpMethod,
        String path,
        String sampleUrl,
        String tenantId,
        boolean enabled,
        int sampleIntervalMinutes,
        Instant lastSampledAt,
        Instant createdAt
) {
    public static SampledEndpointDto from(SampledEndpoint e) {
        return new SampledEndpointDto(
                e.getId(),
                e.getService() != null ? e.getService().getId() : null,
                e.getService() != null ? e.getService().getName() : null,
                e.getHttpMethod(),
                e.getPath(),
                e.getSampleUrl(),
                e.getTenantId(),
                e.isEnabled(),
                e.getSampleIntervalMinutes(),
                e.getLastSampledAt(),
                e.getCreatedAt()
        );
    }

    public record SampledEndpointRequest(
            UUID serviceId,
            String httpMethod,
            String path,
            String sampleUrl,
            String authHeader,
            String tenantId,
            int sampleIntervalMinutes
    ) {
    }
}
