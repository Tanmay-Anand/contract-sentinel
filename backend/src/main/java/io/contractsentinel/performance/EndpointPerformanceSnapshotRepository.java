package io.contractsentinel.performance;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EndpointPerformanceSnapshotRepository extends JpaRepository<EndpointPerformanceSnapshot, UUID> {

    Optional<EndpointPerformanceSnapshot> findTopByServiceAndHttpMethodAndPathOrderByRecordedAtDesc(
            ServiceRegistry service, String httpMethod, String path);

    List<EndpointPerformanceSnapshot> findByServiceAndHttpMethodAndPathAndRecordedAtAfterOrderByRecordedAt(
            ServiceRegistry service, String httpMethod, String path, Instant after);

    /** All snapshots in a window — used to build sparklines and volatility series in one pass. */
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

    /**
     * Service-level latency time-series: max p95, avg p50, max p99, total request count
     * per poll cycle. Replaces the redundant p50/p95 storage in {@code cs_latency_metrics}.
     */
    @Query("""
            SELECT e.recordedAt, MAX(e.p95Ms), AVG(e.p50Ms), MAX(e.p99Ms), SUM(e.countDelta)
            FROM EndpointPerformanceSnapshot e
            WHERE e.service.id = :serviceId
            GROUP BY e.recordedAt
            ORDER BY e.recordedAt DESC
            """)
    List<Object[]> aggregateServiceLatency(@Param("serviceId") UUID serviceId, Pageable pageable);
}
