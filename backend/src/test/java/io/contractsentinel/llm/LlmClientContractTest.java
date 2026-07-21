package io.contractsentinel.llm;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Contract tests for {@link LlmClient} implementations.
 * Any real client (Anthropic, OpenAI, etc.) must satisfy all of these assertions.
 *
 * <p>This class tests the portable types ({@link LlmResponse}, {@link LlmMessage}) that every
 * implementation shares. Integration tests for individual implementations belong in their
 * own subclasses or separate test classes that extend this one.
 */
class LlmClientContractTest {

    // ── LlmResponse ──────────────────────────────────────────────────────────────

    @Test
    void hasToolCalls_returnsFalseWhenToolCallListIsNull() {
        LlmResponse response = new LlmResponse("hello", null, "end_turn");
        assertThat(response.hasToolCalls()).isFalse();
    }

    @Test
    void hasToolCalls_returnsFalseWhenToolCallListIsEmpty() {
        LlmResponse response = new LlmResponse("hello", List.of(), "end_turn");
        assertThat(response.hasToolCalls()).isFalse();
    }

    @Test
    void hasToolCalls_returnsTrueWhenAtLeastOneToolCall() {
        LlmToolCall tc = new LlmToolCall("id1", "query_db", "{\"sql\":\"SELECT 1\"}");
        LlmResponse response = new LlmResponse(null, List.of(tc), "tool_use");
        assertThat(response.hasToolCalls()).isTrue();
    }

    // ── LlmMessage factory methods ────────────────────────────────────────────────

    @Test
    void system_createsMessageWithCorrectRole() {
        LlmMessage msg = LlmMessage.system("You are a helpful assistant.");
        assertThat(msg.role()).isEqualTo(LlmMessage.Role.SYSTEM);
        assertThat(msg.content()).isEqualTo("You are a helpful assistant.");
        assertThat(msg.toolCalls()).isEmpty();
        assertThat(msg.toolCallId()).isNull();
    }

    @Test
    void user_createsMessageWithCorrectRole() {
        LlmMessage msg = LlmMessage.user("What is p95 latency?");
        assertThat(msg.role()).isEqualTo(LlmMessage.Role.USER);
        assertThat(msg.content()).isEqualTo("What is p95 latency?");
    }

    @Test
    void assistant_withNullToolCalls_usesEmptyList() {
        LlmMessage msg = LlmMessage.assistant("Sure, let me check.", null);
        assertThat(msg.role()).isEqualTo(LlmMessage.Role.ASSISTANT);
        assertThat(msg.toolCalls()).isNotNull().isEmpty();
    }

    @Test
    void toolResult_setsToolCallIdAndRole() {
        LlmMessage msg = LlmMessage.toolResult("call-123", "{\"rows\":[]}");
        assertThat(msg.role()).isEqualTo(LlmMessage.Role.TOOL);
        assertThat(msg.toolCallId()).isEqualTo("call-123");
        assertThat(msg.content()).isEqualTo("{\"rows\":[]}");
    }

    // ── LlmToolCall ───────────────────────────────────────────────────────────────

    @Test
    void llmToolCall_exposesIdNameAndInput() {
        LlmToolCall tc = new LlmToolCall("id-abc", "run_sql", "{\"sql\":\"SELECT count(*) FROM spans\"}");
        assertThat(tc.id()).isEqualTo("id-abc");
        assertThat(tc.name()).isEqualTo("run_sql");
        assertThat(tc.argumentsJson()).contains("SELECT count(*)");
    }
}
