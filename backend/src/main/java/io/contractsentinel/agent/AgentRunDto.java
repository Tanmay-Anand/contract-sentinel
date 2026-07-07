package io.contractsentinel.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record AgentRunDto(
        UUID id,
        String agentType,
        String status,
        List<Step> steps,
        String resultMarkdown,
        String llmProvider,
        int iterations,
        Instant createdAt,
        Instant completedAt
) {
    public record Step(int seq, String type, String name, String summary, Instant at) {}

    private static final TypeReference<List<Step>> STEP_LIST = new TypeReference<>() {};

    public static AgentRunDto from(AgentRun run, ObjectMapper mapper) {
        List<Step> steps = List.of();
        if (run.getStepsJson() != null && !run.getStepsJson().isBlank()) {
            try {
                steps = mapper.readValue(run.getStepsJson(), STEP_LIST);
            } catch (Exception ignored) {
                // tolerate malformed step logs
            }
        }
        return new AgentRunDto(
                run.getId(),
                run.getAgentType().name(),
                run.getStatus().name(),
                steps,
                run.getResultMarkdown(),
                run.getLlmProvider(),
                run.getIterations(),
                run.getCreatedAt(),
                run.getCompletedAt()
        );
    }
}
