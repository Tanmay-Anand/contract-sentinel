package io.contractsentinel.infrastructure;

import java.util.UUID;

public record GatewayHealthDto(
        UUID serviceId,
        String serviceName,
        String directUrl,
        String gatewayUrl,
        String directStatus,
        String gatewayStatus,
        String diagnosis
) {
}
