package io.contractsentinel.migration;

import io.contractsentinel.registry.ServiceRegistry;

import java.util.List;
import java.util.UUID;

public interface FlywayMigrationService {

    /** Pull the /actuator/flyway snapshot from the given service and upsert records. */
    void syncFromActuator(ServiceRegistry service);

    /**
     * Scan the configured migration scripts directory (if any) for the given service.
     * Inserts FILESYSTEM_ONLY records for scripts not yet seen by the actuator.
     */
    void syncFromFilesystem(ServiceRegistry service);

    List<FlywayServiceSummaryDto> getAllSummaries();

    List<FlywayMigrationRecordDto> getMigrations(UUID serviceId, String stateFilter);
}
