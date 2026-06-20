package io.contractsentinel.graph;

import java.util.List;
import java.util.UUID;

public record BlastRadiusDto(
        UUID epicenterId,
        String epicenterName,
        List<UUID> directlyImpactedIds,
        List<UUID> transitivelyImpactedIds,
        int totalImpacted
) {
}
