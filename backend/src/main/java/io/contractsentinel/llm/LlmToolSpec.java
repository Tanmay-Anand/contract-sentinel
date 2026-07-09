package io.contractsentinel.llm;

/** Declares a tool to the model: its name, what it does, and a JSON Schema for its arguments. */
public record LlmToolSpec(String name, String description, String parametersJsonSchema) {}
