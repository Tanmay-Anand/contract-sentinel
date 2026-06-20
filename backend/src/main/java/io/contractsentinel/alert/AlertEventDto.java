package io.contractsentinel.alert;

import java.time.Instant;
import java.util.UUID;

public record AlertEventDto(
        UUID id,
        UUID configId,
        UUID serviceId,
        String serviceName,
        AlertTriggerType triggerType,
        String message,
        boolean delivered,
        String errorMessage,
        Instant firedAt
) {
    public static AlertEventDto from(AlertEvent e) {
        return new AlertEventDto(
                e.getId(),
                e.getConfigId(),
                e.getServiceId(),
                e.getServiceName(),
                e.getTriggerType(),
                e.getMessage(),
                e.isDelivered(),
                e.getErrorMessage(),
                e.getFiredAt()
        );
    }
}
