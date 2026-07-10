package io.contractsentinel.llm;

import java.util.List;

/**
 * A single-turn chat abstraction over an LLM provider. The multi-step tool-calling loop lives in
 * the agent layer; a client is responsible only for one request/response and for translating the
 * neutral message/tool model to and from its provider's wire format.
 */
public interface LlmClient {

    LlmResponse chat(List<LlmMessage> messages, List<LlmToolSpec> tools);

    /** Human-readable provider id, for logging and run metadata. */
    String provider();
}
