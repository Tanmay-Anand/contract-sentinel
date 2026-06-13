package io.contractsentinel.drift;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface DriftEventRepository extends JpaRepository<DriftEvent, UUID> {

    Page<DriftEvent> findByServiceOrderByDetectedAtDesc(ServiceRegistry service, Pageable pageable);

    Page<DriftEvent> findAllByOrderByDetectedAtDesc(Pageable pageable);

    Page<DriftEvent> findBySeverityOrderByDetectedAtDesc(DriftEvent.Severity severity, Pageable pageable);

    Page<DriftEvent> findByServiceAndSeverityOrderByDetectedAtDesc(
            ServiceRegistry service, DriftEvent.Severity severity, Pageable pageable);

    long countByServiceAndSeverityAndAcknowledgedFalse(ServiceRegistry service, DriftEvent.Severity severity);

    @Query("SELECT d FROM DriftEvent d WHERE d.toSnapshot.id = :snapshotId")
    List<DriftEvent> findByToSnapshotId(@Param("snapshotId") UUID snapshotId);
}
