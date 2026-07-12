package io.contractsentinel.knowledge;

import java.time.Instant;
import java.util.UUID;

public record SynonymDto(
        UUID id,
        String term,
        GraphSynonym.TargetType targetType,
        String targetName,
        String serviceName,
        boolean proposedByLlm,
        boolean approved,
        Instant createdAt,
        Instant approvedAt
) {
    static SynonymDto from(GraphSynonym s) {
        return new SynonymDto(s.getId(), s.getTerm(), s.getTargetType(), s.getTargetName(),
                s.getServiceName(), s.isProposedByLlm(), s.isApproved(), s.getCreatedAt(), s.getApprovedAt());
    }
}
