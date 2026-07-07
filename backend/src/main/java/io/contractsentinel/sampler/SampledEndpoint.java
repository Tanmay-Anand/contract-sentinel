package io.contractsentinel.sampler;

import io.contractsentinel.registry.ServiceRegistry;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_sampled_endpoints")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SampledEndpoint {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "service_id")
    private ServiceRegistry service;

    @Column(length = 10)
    @Builder.Default
    private String httpMethod = "GET";

    @Column(length = 300)
    private String path;

    @Column(length = 500)
    private String sampleUrl;

    @Column(columnDefinition = "text")
    private String authHeader;

    @Column(length = 100)
    private String tenantId;

    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = true;

    @Column(nullable = false)
    @Builder.Default
    private int sampleIntervalMinutes = 60;

    private Instant lastSampledAt;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
