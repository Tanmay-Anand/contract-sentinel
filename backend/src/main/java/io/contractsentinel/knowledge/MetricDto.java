package io.contractsentinel.knowledge;

import java.time.Instant;
import java.util.UUID;

public record MetricDto(
        UUID id,
        String name,
        String displayName,
        String description,
        String sqlDefinition,
        String anchorTable,
        String serviceName,
        GraphMetric.AggregationFunction aggregationFunction,
        boolean proposedByLlm,
        boolean approved,
        Instant createdAt,
        Instant approvedAt
) {
    static MetricDto from(GraphMetric m) {
        return new MetricDto(m.getId(), m.getName(), m.getDisplayName(), m.getDescription(),
                m.getSqlDefinition(), m.getAnchorTable(), m.getServiceName(),
                m.getAggregationFunction(), m.isProposedByLlm(), m.isApproved(),
                m.getCreatedAt(), m.getApprovedAt());
    }
}
