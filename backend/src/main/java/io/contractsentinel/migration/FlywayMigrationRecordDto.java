package io.contractsentinel.migration;

import java.time.Instant;
import java.util.UUID;

public record FlywayMigrationRecordDto(
        UUID id,
        UUID serviceId,
        String serviceName,
        String version,
        String description,
        String script,
        String type,
        String state,
        Integer checksum,
        Instant installedOn,
        String installedBy,
        Integer executionTime,
        String source,
        Instant snapshotAt
) {
    static FlywayMigrationRecordDto from(CsMigrationRecord r) {
        return new FlywayMigrationRecordDto(
                r.getId(), r.getServiceId(), r.getServiceName(), r.getVersion(),
                r.getDescription(), r.getScript(), r.getType(), r.getState(),
                r.getChecksum(), r.getInstalledOn(), r.getInstalledBy(),
                r.getExecutionTime(), r.getSource(), r.getSnapshotAt());
    }
}
