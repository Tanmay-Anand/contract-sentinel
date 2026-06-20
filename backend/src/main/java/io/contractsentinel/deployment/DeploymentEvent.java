package io.contractsentinel.deployment;

import io.contractsentinel.registry.ServiceRegistry;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_deployment_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DeploymentEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false)
    private ServiceRegistry service;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant detectedAt = Instant.now();

    @Column(length = 50)
    private String buildVersion;

    @Column(length = 100)
    private String buildTime;

    @Column(length = 40)
    private String gitCommit;

    @Column(length = 100)
    private String gitBranch;

    @Column(length = 300)
    private String gitMessage;
}
