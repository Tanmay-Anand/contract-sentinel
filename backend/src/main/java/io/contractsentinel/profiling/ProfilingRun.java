package io.contractsentinel.profiling;

import io.contractsentinel.registry.ServiceRegistry;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/** One JFR profiling session against a service, tracked through its lifecycle. */
@Entity
@Table(name = "cs_profiling_runs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProfilingRun {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false)
    private ServiceRegistry service;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(nullable = false)
    private int durationSeconds;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant startedAt = Instant.now();

    private Instant completedAt;

    @Column(length = 500)
    private String errorMessage;

    private long totalSamples;

    public enum Status {
        REQUESTED, RECORDING, DOWNLOADING, PARSING, COMPLETE, FAILED
    }
}
