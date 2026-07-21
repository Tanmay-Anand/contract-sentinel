package io.contractsentinel.migration;

import java.util.UUID;

public record FlywayServiceSummaryDto(
        UUID serviceId,
        String serviceName,
        int totalApplied,
        int pending,
        int failed,
        int outOfOrder,
        int filesystemOnly,
        int missingSuccess,
        boolean hasIssues
) {}
