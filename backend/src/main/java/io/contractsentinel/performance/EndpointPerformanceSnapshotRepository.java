package io.contractsentinel.performance;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EndpointPerformanceSnapshotRepository extends JpaRepository<EndpointPerformanceSnapshot, UUID> {

    Optional<EndpointPerformanceSnapshot> findTopByServiceAndHttpMethodAndPathOrderByRecordedAtDesc(
            ServiceRegistry service, String httpMethod, String path);

    List<EndpointPerformanceSnapshot> findByServiceAndHttpMethodAndPathAndRecordedAtAfterOrderByRecordedAt(
            ServiceRegistry service, String httpMethod, String path, Instant after);

    /** All snapshots in a window â€” used to build sparklines and volatility series in one pass. */
    List<EndpointPerformanceSnapshot> findByRecordedAtAfterOrderByRecordedAt(Instant after);

    /** The most recent snapshot for every distinct (service, method, path). */
    @Query("""
            SELECT e FROM EndpointPerformanceSnapshot e
            WHERE e.recordedAt = (
                SELECT MAX(e2.recordedAt) FROM EndpointPerformanceSnapshot e2
                WHERE e2.service = e.service AND e2.httpMethod = e.httpMethod AND e2.path = e.path
            )
            """)
    List<EndpointPerformanceSnapshot> findLatestPerEndpoint();

    void deleteByRecordedAtBefore(Instant cutoff);
}
