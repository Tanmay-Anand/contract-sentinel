package io.contractsentinel.drift;

import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.snapshot.SpecSnapshot;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_drift_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DriftEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false)
    private ServiceRegistry service;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_snapshot_id")
    private SpecSnapshot fromSnapshot;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "to_snapshot_id", nullable = false)
    private SpecSnapshot toSnapshot;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant detectedAt = Instant.now();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private ChangeType changeType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Severity severity;

    @Column(length = 10)
    private String httpMethod;

    @Column(length = 300)
    private String apiPath;

    /**
     * Identifies WHICH field a field-level change affects (null for path-level events).
     * Part of the dedup key: without it, a second RESPONSE_FIELD_REMOVED on the same
     * endpoint would be silently swallowed as a duplicate of the first.
     */
    @Column(length = 300)
    private String fieldPath;

    @Column(columnDefinition = "text")
    private String detail;

    @Column(nullable = false)
    @Builder.Default
    private boolean acknowledged = false;

    public enum ChangeType {
        PATH_REMOVED,
        RESPONSE_FIELD_REMOVED,
        RESPONSE_FIELD_TYPE_CHANGED,
        REQUEST_REQUIRED_FIELD_ADDED,
        PATH_ADDED,
        RESPONSE_FIELD_ADDED,
        REQUEST_OPTIONAL_FIELD_ADDED,
        PARAM_REMOVED,
        PARAM_TYPE_CHANGED,
        PARAM_BECAME_REQUIRED
    }

    public enum Severity {
        BREAKING, SAFE
    }
}
