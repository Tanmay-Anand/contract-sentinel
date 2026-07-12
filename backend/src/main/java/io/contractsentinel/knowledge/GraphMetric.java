package io.contractsentinel.knowledge;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_graph_metrics")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GraphMetric {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(nullable = false, length = 200)
    private String displayName;

    @Column(length = 1000)
    private String description;

    @Column(nullable = false, length = 2000)
    private String sqlDefinition;

    @Column(nullable = false, length = 100)
    private String anchorTable;

    @Column(length = 100)
    private String serviceName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AggregationFunction aggregationFunction;

    @Column(nullable = false)
    @Builder.Default
    private boolean proposedByLlm = false;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column
    private Instant approvedAt;

    public enum AggregationFunction {COUNT, SUM, AVG, MIN, MAX, CUSTOM}

    public boolean isApproved() {
        return approvedAt != null;
    }
}
