package io.contractsentinel.profiling;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/** A single hot method row belonging to a {@link ProfilingRun}, ranked by CPU sample share. */
@Entity
@Table(name = "cs_profiling_hot_methods", indexes = @Index(name = "idx_hot_method_run", columnList = "runId"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HotMethod {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID runId;

    @Column(nullable = false)
    private int rank;

    @Column(nullable = false, length = 500)
    private String frame;

    @Column(nullable = false)
    private long sampleCount;

    @Column(nullable = false)
    private double percentage;
}
