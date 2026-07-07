package io.contractsentinel.agent;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * A capability the agent can invoke. Each tool wraps an existing Contract Sentinel service and
 * returns a compact string (usually JSON) that is fed back to the model as a tool result.
 */
public interface AgentTool {

    String name();

    String description();

    /** JSON Schema (as a string) describing the tool's arguments object. */
    String parametersJsonSchema();

    /** Execute with the model-supplied arguments. May throw; the loop reports failures to the model. */
    String execute(JsonNode args) throws Exception;
}
