package io.contractsentinel.snapshot;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SpecSnapshotRepository extends JpaRepository<SpecSnapshot, UUID> {

    Optional<SpecSnapshot> findTopByServiceOrderByFetchedAtDesc(ServiceRegistry service);

    // Only use successfully fetched snapshots as diff baseline — UNREACHABLE entries have null specJson
    Optional<SpecSnapshot> findTopByServiceAndFetchStatusOrderByFetchedAtDesc(
            ServiceRegistry service, SpecSnapshot.FetchStatus fetchStatus);

    Page<SpecSnapshot> findByServiceOrderByFetchedAtDesc(ServiceRegistry service, Pageable pageable);
}
