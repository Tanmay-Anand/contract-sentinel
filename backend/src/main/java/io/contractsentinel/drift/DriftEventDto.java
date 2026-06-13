package io.contractsentinel.drift;

import java.time.Instant;
import java.util.UUID;

public record DriftEventDto(
        UUID id,
        UUID serviceId,
        String serviceName,
        String changeType,
        String severity,
        String httpMethod,
        String apiPath,
        String detail,
        Instant detectedAt,
        boolean acknowledged
) {
    public static DriftEventDto from(DriftEvent e) {
        return new DriftEventDto(
                e.getId(),
                e.getService().getId(),
                e.getService().getName(),
                e.getChangeType().name(),
                e.getSeverity().name(),
                e.getHttpMethod(),
                e.getApiPath(),
                e.getDetail(),
                e.getDetectedAt(),
                e.isAcknowledged()
        );
    }
}
