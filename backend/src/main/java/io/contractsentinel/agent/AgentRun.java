package io.contractsentinel.agent;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A single autonomous agent invocation. {@code stepsJson} is an append-only JSON array so the UI
 * can poll a live view of the investigation as tool calls and results accrue.
 */
@Entity
@Table(name = "cs_agent_runs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AgentRun {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AgentType agentType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(columnDefinition = "text")
    private String inputJson;

    @Column(columnDefinition = "text")
    @Builder.Default
    private String stepsJson = "[]";

    @Column(columnDefinition = "text")
    private String resultMarkdown;

    @Column(columnDefinition = "text")
    private String provenanceJson;

    @Column(length = 80)
    private String llmProvider;

    @Column(nullable = false)
    private int iterations;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant completedAt;

    public enum AgentType { DIAGNOSE, SCHEMA_RISK, DIAGNOSE_STRUCTURED }

    public enum Status { RUNNING, COMPLETE, FAILED }
}
