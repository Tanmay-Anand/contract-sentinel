package io.contractsentinel.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
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
        Instant completedAt,
        Provenance provenance
) {
    public record Step(int seq, String type, String name, String summary, Instant at) {}

    public record Provenance(List<LlmCallEntry> calls, long totalMs) {
        public record LlmCallEntry(int iter, int ctxMsgs, long ms) {}
    }

    private static final TypeReference<List<Step>> STEP_LIST = new TypeReference<>() {};

    public static AgentRunDto from(AgentRun run, ObjectMapper mapper) {
        List<Step> steps = List.of();
        if (run.getStepsJson() != null && !run.getStepsJson().isBlank()) {
            try {
                steps = mapper.readValue(run.getStepsJson(), STEP_LIST);
            } catch (Exception ignored) {}
        }

        Provenance provenance = null;
        if (run.getProvenanceJson() != null && !run.getProvenanceJson().isBlank()) {
            try {
                JsonNode arr = mapper.readTree(run.getProvenanceJson());
                List<Provenance.LlmCallEntry> calls = new ArrayList<>();
                long totalMs = 0;
                for (JsonNode entry : arr) {
                    int iter = entry.path("iter").asInt();
                    int ctxMsgs = entry.path("ctxMsgs").asInt();
                    long ms = entry.path("ms").asLong();
                    calls.add(new Provenance.LlmCallEntry(iter, ctxMsgs, ms));
                    totalMs += ms;
                }
                provenance = new Provenance(calls, totalMs);
            } catch (Exception ignored) {}
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
                run.getCompletedAt(),
                provenance
        );
    }
}
