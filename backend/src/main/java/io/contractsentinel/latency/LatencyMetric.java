package io.contractsentinel.latency;

import io.contractsentinel.registry.ServiceRegistry;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_latency_metrics")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LatencyMetric {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false)
    private ServiceRegistry service;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant recordedAt = Instant.now();

    @Column(nullable = true)
    private Long specFetchMs;

    @Column(nullable = true)
    private Double p50Ms;

    @Column(nullable = true)
    private Double p95Ms;

    @Column(nullable = true)
    private Double p99Ms;

    @Column(nullable = true)
    private Long requestCount;

    /** The endpoint with the highest P95 at this scrape cycle, populated from Prometheus data. */
    @Column(nullable = true, length = 20)
    private String dominantEndpointMethod;

    @Column(nullable = true, length = 500)
    private String dominantEndpointPath;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Source source;

    public enum Source {
        SPEC_POLL, ACTUATOR
    }
}
