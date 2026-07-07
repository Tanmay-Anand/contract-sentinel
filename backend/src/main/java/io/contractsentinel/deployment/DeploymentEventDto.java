package io.contractsentinel.deployment;

import java.time.Instant;
import java.util.UUID;

public record DeploymentEventDto(
        UUID id,
        UUID serviceId,
        String serviceName,
        Instant detectedAt,
        String buildVersion,
        String buildTime,
        String gitCommit,
        String gitBranch,
        String gitMessage
) {
    public static DeploymentEventDto from(DeploymentEvent e) {
        return new DeploymentEventDto(
                e.getId(),
                e.getService().getId(),
                e.getService().getName(),
                e.getDetectedAt(),
                e.getBuildVersion(),
                e.getBuildTime(),
                e.getGitCommit(),
                e.getGitBranch(),
                e.getGitMessage()
        );
    }
}
