package io.contractsentinel.knowledge;

public record ServiceKnowledgeSummaryDto(
        String serviceName,
        long approvedSynonyms,
        long pendingSynonyms,
        long approvedMetrics,
        long pendingMetrics
) {}
