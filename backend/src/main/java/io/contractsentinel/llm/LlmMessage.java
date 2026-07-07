package io.contractsentinel.llm;

import java.util.List;

/**
 * Provider-neutral chat message. {@code toolCalls} is populated on assistant turns that request
 * tools; {@code toolCallId} is set on {@code tool} messages carrying a tool's result.
 */
public record LlmMessage(
        Role role,
        String content,
        List<LlmToolCall> toolCalls,
        String toolCallId
) {
    public enum Role { SYSTEM, USER, ASSISTANT, TOOL }

    public static LlmMessage system(String content) {
        return new LlmMessage(Role.SYSTEM, content, List.of(), null);
    }

    public static LlmMessage user(String content) {
        return new LlmMessage(Role.USER, content, List.of(), null);
    }

    public static LlmMessage assistant(String content, List<LlmToolCall> toolCalls) {
        return new LlmMessage(Role.ASSISTANT, content, toolCalls == null ? List.of() : toolCalls, null);
    }

    public static LlmMessage toolResult(String toolCallId, String content) {
        return new LlmMessage(Role.TOOL, content, List.of(), toolCallId);
    }
}
