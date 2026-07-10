package io.contractsentinel.performance;

import io.contractsentinel.registry.ServiceRegistry;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A point-in-time performance reading for a single endpoint (method + path) of a service,
 * captured every scheduled poll from the service's {@code /actuator/prometheus} output.
 *
 * <p>Unlike the actuator, which only exposes cumulative counters, this table accumulates
 * history so the registry can answer "what did this endpoint's p95 look like 3 days ago?".
 */
@Entity
@Table(
        name = "cs_endpoint_performance_snapshots",
        indexes = @Index(name = "idx_eps_lookup", columnList = "service_id, httpMethod, path, recordedAt")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EndpointPerformanceSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false)
    private ServiceRegistry service;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant recordedAt = Instant.now();

    @Column(nullable = false, length = 10)
    private String httpMethod;

    @Column(nullable = false, length = 300)
    private String path;

    @Column(nullable = true)
    private Double p50Ms;

    @Column(nullable = true)
    private Double p95Ms;

    @Column(nullable = true)
    private Double p99Ms;

    /** Cumulative request count as reported by the service â€” kept so deltas survive service restarts. */
    @Column(nullable = false)
    private long totalCount;

    /** Requests since the previous snapshot ({@code max(0, current - previous)}). */
    @Column(nullable = false)
    private long countDelta;

    /** Cumulative count of 4xx + 5xx responses. */
    @Column(nullable = false)
    private long errorCount;
}
