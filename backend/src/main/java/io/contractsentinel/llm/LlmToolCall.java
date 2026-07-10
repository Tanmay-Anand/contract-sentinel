package io.contractsentinel.llm;

/** A tool invocation requested by the model. {@code argumentsJson} is a JSON object string. */
public record LlmToolCall(String id, String name, String argumentsJson) {}
