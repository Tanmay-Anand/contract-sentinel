package io.contractsentinel.knowledge;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_graph_synonyms")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GraphSynonym {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 200)
    private String term;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TargetType targetType;

    @Column(nullable = false, length = 200)
    private String targetName;

    @Column(length = 100)
    private String serviceName;

    @Column(nullable = false)
    @Builder.Default
    private boolean proposedByLlm = false;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column
    private Instant approvedAt;

    public enum TargetType {TABLE, COLUMN, METRIC}

    public boolean isApproved() {
        return approvedAt != null;
    }
}
