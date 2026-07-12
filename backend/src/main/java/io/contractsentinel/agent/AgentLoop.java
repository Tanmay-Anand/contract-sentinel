package io.contractsentinel.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.llm.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The autonomous tool-calling loop: it lets the LLM pick tools, executes them, feeds results back,
 * and repeats until the model produces a final answer (or the iteration/time budget is exhausted).
 * Runs on a background thread; every step is persisted immediately for live polling.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AgentLoop {

    private static final int MAX_TOOL_RESULT_CHARS = 4000;
    private static final long WALL_CLOCK_MS = 5 * 60 * 1000L;

    private final LlmClient llmClient;
    private final LlmProperties llmProperties;
    private final AgentRunStore store;
    private final ObjectMapper mapper = new ObjectMapper();

    @Async("agentTaskExecutor")
    public void run(UUID runId, String systemPrompt, String userPrompt, List<AgentTool> tools) {
        Map<String, AgentTool> byName = tools.stream()
                .collect(Collectors.toMap(AgentTool::name, Function.identity(), (a, b) -> a));
        List<LlmToolSpec> specs = tools.stream()
                .map(t -> new LlmToolSpec(t.name(), t.description(), t.parametersJsonSchema()))
                .toList();

        List<LlmMessage> messages = new ArrayList<>();
        messages.add(LlmMessage.system(systemPrompt));
        messages.add(LlmMessage.user(userPrompt));

        long deadline = System.currentTimeMillis() + WALL_CLOCK_MS;
        try {
            for (int i = 0; i < llmProperties.getMaxIterations(); i++) {
                if (System.currentTimeMillis() > deadline) {
                    store.fail(runId, "Agent exceeded its time budget before reaching a conclusion.");
                    return;
                }

                LlmResponse response = llmClient.chat(messages, specs);
                store.incrementIteration(runId);

                if (!response.hasToolCalls()) {
                    store.complete(runId, response.content());
                    return;
                }

                if (response.content() != null && !response.content().isBlank()) {
                    store.appendStep(runId, "thought", null, response.content());
                }
                messages.add(LlmMessage.assistant(response.content(), response.toolCalls()));

                for (LlmToolCall call : response.toolCalls()) {
                    store.appendStep(runId, "tool_call", call.name(), call.argumentsJson());
                    String result = invoke(byName, call);
                    store.appendStep(runId, "tool_result", call.name(), result);
                    messages.add(LlmMessage.toolResult(call.id(), result));
                }
            }
            store.fail(runId, "Agent reached the maximum number of iterations without concluding.");
        } catch (Exception e) {
            log.warn("Agent run {} failed: {}", runId, e.getMessage());
            store.fail(runId, "Agent failed: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
        }
    }

    private String invoke(Map<String, AgentTool> byName, LlmToolCall call) {
        AgentTool tool = byName.get(call.name());
        if (tool == null) {
            return "ERROR: unknown tool '" + call.name() + "'";
        }
        try {
            JsonNode args = call.argumentsJson() == null || call.argumentsJson().isBlank()
                    ? mapper.createObjectNode() : mapper.readTree(call.argumentsJson());
            String result = tool.execute(args);
            return truncate(result == null ? "" : result);
        } catch (Exception e) {
            return "ERROR: " + (e.getMessage() != null ? e.getMessage() : e.toString());
        }
    }

    private static String truncate(String s) {
        return s.length() <= MAX_TOOL_RESULT_CHARS ? s
                : s.substring(0, MAX_TOOL_RESULT_CHARS) + "\nâ€¦(truncated)";
    }
}
