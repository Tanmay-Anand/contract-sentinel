package io.contractsentinel.agent;

import io.contractsentinel.llm.LlmClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Entry point agents use to launch a run: it records the run synchronously (so the caller gets an
 * id immediately) and hands the tool-calling loop off to a background thread.
 */
@Component
@RequiredArgsConstructor
public class AgentExecutor {

    private final AgentRunStore store;
    private final AgentLoop loop;
    private final LlmClient llmClient;

    public UUID start(AgentRun.AgentType type, String inputJson,
                      String systemPrompt, String userPrompt, List<AgentTool> tools) {
        UUID runId = store.create(type, inputJson, llmClient.provider());
        loop.run(runId, systemPrompt, userPrompt, tools);
        return runId;
    }
}
