package io.contractsentinel.alert;

import java.time.Instant;
import java.util.UUID;

public record AlertConfigDto(
        UUID id,
        String name,
        AlertChannel channel,
        String destination,
        boolean triggerOnBreaking,
        boolean triggerOnUnreachable,
        boolean triggerOnSafe,
        UUID serviceFilter,
        int cooldownMinutes,
        boolean enabled,
        Instant createdAt
) {
    public static AlertConfigDto from(AlertConfig c) {
        return new AlertConfigDto(
                c.getId(),
                c.getName(),
                c.getChannel(),
                c.getDestination(),
                c.isTriggerOnBreaking(),
                c.isTriggerOnUnreachable(),
                c.isTriggerOnSafe(),
                c.getServiceFilter(),
                c.getCooldownMinutes(),
                c.isEnabled(),
                c.getCreatedAt()
        );
    }

    public record AlertConfigRequest(
            String name,
            AlertChannel channel,
            String destination,
            boolean triggerOnBreaking,
            boolean triggerOnUnreachable,
            boolean triggerOnSafe,
            UUID serviceFilter,
            int cooldownMinutes
    ) {}
}
