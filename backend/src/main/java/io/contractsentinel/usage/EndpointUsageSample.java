package io.contractsentinel.usage;

import io.contractsentinel.registry.ServiceRegistry;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_endpoint_usage_samples")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EndpointUsageSample {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false)
    private ServiceRegistry service;

    @Column(length = 10)
    private String httpMethod;

    @Column(length = 300)
    private String path;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant sampledAt = Instant.now();

    @Column(nullable = false)
    private Long totalCount;

    @Column(nullable = false)
    private Long deltaCount;

    @Column(nullable = true)
    private Long errorCount;
}
