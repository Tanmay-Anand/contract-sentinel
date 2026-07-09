package io.contractsentinel.sampler;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_sampling_results")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SamplingResult {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "endpoint_id", nullable = false)
    private SampledEndpoint endpoint;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant sampledAt = Instant.now();

    @Column(nullable = false)
    private int httpStatus;

    @Column(columnDefinition = "text")
    private String actualFields;

    @Column(columnDefinition = "text")
    private String specFields;

    @Column(columnDefinition = "text")
    private String undocumentedFields;

    @Column(columnDefinition = "text")
    private String missingFields;

    @Column(nullable = false)
    private int matchScore;

    @Column(name = "response_size_bytes")
    private Long responseSizeBytes;

    @Column(name = "duration_ms")
    private Long durationMs;
}
