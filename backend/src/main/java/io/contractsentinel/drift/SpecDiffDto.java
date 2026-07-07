package io.contractsentinel.drift;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SpecDiffDto(
        UUID fromSnapshotId,
        UUID toSnapshotId,
        Instant detectedAt,
        long totalBreaking,
        long totalSafe,
        List<DiffGroupDto> groups
) {
}
