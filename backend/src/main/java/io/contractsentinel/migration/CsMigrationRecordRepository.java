package io.contractsentinel.migration;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CsMigrationRecordRepository extends JpaRepository<CsMigrationRecord, UUID> {

    List<CsMigrationRecord> findByServiceIdOrderByVersionAsc(UUID serviceId);

    List<CsMigrationRecord> findByServiceIdAndStateOrderByVersionAsc(UUID serviceId, String state);

    Optional<CsMigrationRecord> findByServiceIdAndScript(UUID serviceId, String script);

    /** Count records by state for a given service â€” used to build the summary. */
    @Query("SELECT r.state, COUNT(r) FROM CsMigrationRecord r WHERE r.serviceId = :sid GROUP BY r.state")
    List<Object[]> countByStateForService(@Param("sid") UUID serviceId);

    @Query("SELECT DISTINCT r.serviceId, r.serviceName FROM CsMigrationRecord r")
    List<Object[]> findDistinctServiceIdAndName();

    /** Returns all services that have at least one non-SUCCESS record (quick issue scan). */
    @Query("SELECT DISTINCT r.serviceId FROM CsMigrationRecord r WHERE r.state NOT IN ('SUCCESS', 'BASELINE', 'IGNORED')")
    List<UUID> findServicesWithIssues();
}
