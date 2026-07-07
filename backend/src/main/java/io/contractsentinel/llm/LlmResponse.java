package io.contractsentinel.llm;

import java.util.List;

/** A single model turn: free text, any requested tool calls, and why the model stopped. */
public record LlmResponse(String content, List<LlmToolCall> toolCalls, String stopReason) {

    public boolean hasToolCalls() {
        return toolCalls != null && !toolCalls.isEmpty();
    }
}
