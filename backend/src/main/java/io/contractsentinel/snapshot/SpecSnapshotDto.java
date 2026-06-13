package io.contractsentinel.snapshot;

import java.time.Instant;
import java.util.UUID;

public record SpecSnapshotDto(
        UUID id,
        UUID serviceId,
        String serviceName,
        String specHash,
        Instant fetchedAt,
        String fetchStatus
) {
    public static SpecSnapshotDto from(SpecSnapshot s) {
        return new SpecSnapshotDto(
                s.getId(),
                s.getService().getId(),
                s.getService().getName(),
                s.getSpecHash(),
                s.getFetchedAt(),
                s.getFetchStatus().name()
        );
    }
}
