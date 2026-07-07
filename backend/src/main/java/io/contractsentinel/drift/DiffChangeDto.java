package io.contractsentinel.drift;

import java.time.Instant;

public record DiffChangeDto(
        String changeType,
        String severity,
        String httpMethod,
        String apiPath,
        String detail,
        Instant detectedAt,
        boolean acknowledged
) {
    public static DiffChangeDto from(DriftEvent e) {
        return new DiffChangeDto(
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
