package io.contractsentinel.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Small transactional operations on an {@link AgentRun}. Each step is persisted the moment it
 * happens so the polling UI shows the investigation unfold live.
 */
@Component
@RequiredArgsConstructor
public class AgentRunStore {

    private final AgentRunRepository repository;
    private final ObjectMapper mapper = new ObjectMapper();

    @Transactional
    public UUID create(AgentRun.AgentType type, String inputJson, String provider) {
        AgentRun run = repository.save(AgentRun.builder()
                .agentType(type)
                .status(AgentRun.Status.RUNNING)
                .inputJson(inputJson)
                .llmProvider(provider)
                .stepsJson("[]")
                .build());
        return run.getId();
    }

    @Transactional
    public void appendStep(UUID runId, String type, String name, String summary) {
        repository.findById(runId).ifPresent(run -> {
            try {
                ArrayNode steps = (ArrayNode) mapper.readTree(
                        run.getStepsJson() == null || run.getStepsJson().isBlank() ? "[]" : run.getStepsJson());
                ObjectNode step = steps.addObject();
                step.put("seq", steps.size());
                step.put("type", type);
                step.put("name", name);
                step.put("summary", summary);
                step.put("at", Instant.now().toString());
                run.setStepsJson(mapper.writeValueAsString(steps));
                repository.save(run);
            } catch (Exception ignored) {
                // never let step logging break the run
            }
        });
    }

    @Transactional
    public void incrementIteration(UUID runId) {
        repository.findById(runId).ifPresent(run -> {
            run.setIterations(run.getIterations() + 1);
            repository.save(run);
        });
    }

    @Transactional
    public void complete(UUID runId, String resultMarkdown) {
        repository.findById(runId).ifPresent(run -> {
            run.setStatus(AgentRun.Status.COMPLETE);
            run.setResultMarkdown(resultMarkdown);
            run.setCompletedAt(Instant.now());
            repository.save(run);
        });
    }

    @Transactional
    public void fail(UUID runId, String message) {
        repository.findById(runId).ifPresent(run -> {
            run.setStatus(AgentRun.Status.FAILED);
            run.setResultMarkdown(message);
            run.setCompletedAt(Instant.now());
            repository.save(run);
        });
    }

    @Transactional
    public void recordLlmCall(UUID runId, int iteration, int contextMessages, long durationMs) {
        repository.findById(runId).ifPresent(run -> {
            try {
                String existing = run.getProvenanceJson();
                ArrayNode calls;
                if (existing == null || existing.isBlank()) {
                    calls = mapper.createArrayNode();
                } else {
                    calls = (ArrayNode) mapper.readTree(existing);
                }
                ObjectNode entry = calls.addObject();
                entry.put("iter", iteration);
                entry.put("ctxMsgs", contextMessages);
                entry.put("ms", durationMs);
                run.setProvenanceJson(mapper.writeValueAsString(calls));
                repository.save(run);
            } catch (Exception ignored) {}
        });
    }

    @Transactional(readOnly = true)
    public AgentRunDto get(UUID runId) {
        AgentRun run = repository.findById(runId)
                .orElseThrow(() -> SentinelException.notFound("Agent run not found: " + runId, RequestContext.getRequestId()));
        return AgentRunDto.from(run, mapper);
    }

    @Transactional(readOnly = true)
    public List<AgentRunDto> history(AgentRun.AgentType type) {
        List<AgentRun> runs = type == null
                ? repository.findTop20ByOrderByCreatedAtDesc()
                : repository.findTop20ByAgentTypeOrderByCreatedAtDesc(type);
        return runs.stream().map(r -> AgentRunDto.from(r, mapper)).toList();
    }
}
