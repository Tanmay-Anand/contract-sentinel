package io.contractsentinel.graph;

import io.contractsentinel.registry.ServiceRegistry;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_service_dependencies",
    uniqueConstraints = @UniqueConstraint(columnNames = {"source_service_id", "target_service_id", "detection_method"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ServiceDependency {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_service_id")
    private ServiceRegistry sourceService;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "target_service_id")
    private ServiceRegistry targetService;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DetectionMethod detectionMethod;

    @Column(length = 200)
    private String propertyName; // e.g. "platform.api.base-url", null for MANUAL

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Confidence confidence;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant detectedAt = Instant.now();

    @Column(nullable = false)
    private Instant verifiedAt; // last time scan succeeded and confirmed this edge

    @Column(nullable = true)
    private Instant scanFailedAt; // last time source service env scan failed; null = never failed or last failure predates verifiedAt

    // JSON array of known HTTP calls: [{"method":"GET","path":"/...","description":"..."}]
    // Populated by DataSeeder for statically-known clients; null when unknown.
    @Column(columnDefinition = "text")
    private String endpointCallsJson;

    public boolean isStale() {
        return scanFailedAt != null && scanFailedAt.isAfter(verifiedAt);
    }

    public enum DetectionMethod { ACTUATOR_ENV, MANUAL }

    public enum Confidence { HIGH, MEDIUM, LOW }
}
