package io.contractsentinel.snapshot;

import io.contractsentinel.registry.ServiceRegistry;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_spec_snapshots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SpecSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false)
    private ServiceRegistry service;

    @Column(columnDefinition = "text")
    private String specJson;

    @Column(nullable = false, length = 64)
    private String specHash;

    @Column(nullable = false)
    private Instant fetchedAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FetchStatus fetchStatus;

    @Column(nullable = true)
    private Long fetchDurationMs;

    public enum FetchStatus {
        FETCHED, UNREACHABLE, PARSE_FAILED
    }
}
