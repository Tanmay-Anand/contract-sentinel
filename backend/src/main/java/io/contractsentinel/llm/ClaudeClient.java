package io.contractsentinel.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * {@link LlmClient} for the Anthropic Messages API. Translates the neutral message model into
 * Claude's content-block format (text / tool_use / tool_result) and back.
 */
@Slf4j
public class ClaudeClient implements LlmClient {

    private static final String ANTHROPIC_VERSION = "2023-06-01";

    private final LlmProperties.Claude config;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient restClient;

    public ClaudeClient(LlmProperties props) {
        this.config = props.getClaude();
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(5));
        f.setReadTimeout(Duration.ofSeconds(props.getRequestTimeoutSeconds()));
        this.restClient = RestClient.builder().requestFactory(f).build();
    }

    @Override
    public String provider() {
        return "claude:" + config.getModel();
    }

    @Override
    public LlmResponse chat(List<LlmMessage> messages, List<LlmToolSpec> tools) {
        if (config.getApiKey() == null || config.getApiKey().isBlank()) {
            throw new IllegalStateException("Claude API key is not configured (sentinel.llm.claude.api-key)");
        }

        ObjectNode body = mapper.createObjectNode();
        body.put("model", config.getModel());
        body.put("max_tokens", config.getMaxTokens());

        StringBuilder system = new StringBuilder();
        ArrayNode msgs = body.putArray("messages");
        List<LlmMessage> pendingToolResults = new ArrayList<>();

        for (LlmMessage m : messages) {
            if (m.role() == LlmMessage.Role.SYSTEM) {
                if (system.length() > 0) system.append("\n\n");
                system.append(m.content());
                continue;
            }
            if (m.role() == LlmMessage.Role.TOOL) {
                pendingToolResults.add(m);
                continue;
            }
            flushToolResults(msgs, pendingToolResults);
            if (m.role() == LlmMessage.Role.USER) {
                msgs.add(textMessage("user", m.content()));
            } else if (m.role() == LlmMessage.Role.ASSISTANT) {
                msgs.add(assistantMessage(m));
            }
        }
        flushToolResults(msgs, pendingToolResults);

        if (system.length() > 0) {
            body.put("system", system.toString());
        }
        if (tools != null && !tools.isEmpty()) {
            ArrayNode toolArr = body.putArray("tools");
            for (LlmToolSpec t : tools) {
                ObjectNode tool = toolArr.addObject();
                tool.put("name", t.name());
                tool.put("description", t.description());
                tool.set("input_schema", readTree(t.parametersJsonSchema()));
            }
        }

        JsonNode response = restClient.post()
                .uri(config.getBaseUrl() + "/v1/messages")
                .header("x-api-key", config.getApiKey())
                .header("anthropic-version", ANTHROPIC_VERSION)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body.toString())
                .retrieve()
                .body(JsonNode.class);

        return parseResponse(response);
    }

    private void flushToolResults(ArrayNode msgs, List<LlmMessage> pending) {
        if (pending.isEmpty()) return;
        ObjectNode msg = mapper.createObjectNode();
        msg.put("role", "user");
        ArrayNode content = msg.putArray("content");
        for (LlmMessage tr : pending) {
            ObjectNode block = content.addObject();
            block.put("type", "tool_result");
            block.put("tool_use_id", tr.toolCallId());
            block.put("content", tr.content() == null ? "" : tr.content());
        }
        msgs.add(msg);
        pending.clear();
    }

    private ObjectNode textMessage(String role, String text) {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("role", role);
        ArrayNode content = msg.putArray("content");
        content.addObject().put("type", "text").put("text", text == null ? "" : text);
        return msg;
    }

    private ObjectNode assistantMessage(LlmMessage m) {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("role", "assistant");
        ArrayNode content = msg.putArray("content");
        if (m.content() != null && !m.content().isBlank()) {
            content.addObject().put("type", "text").put("text", m.content());
        }
        for (LlmToolCall call : m.toolCalls()) {
            ObjectNode block = content.addObject();
            block.put("type", "tool_use");
            block.put("id", call.id());
            block.put("name", call.name());
            block.set("input", readTree(call.argumentsJson()));
        }
        return msg;
    }

    private LlmResponse parseResponse(JsonNode response) {
        StringBuilder text = new StringBuilder();
        List<LlmToolCall> calls = new ArrayList<>();
        if (response != null && response.path("content").isArray()) {
            for (JsonNode block : response.path("content")) {
                String type = block.path("type").asText("");
                if ("text".equals(type)) {
                    text.append(block.path("text").asText(""));
                } else if ("tool_use".equals(type)) {
                    calls.add(new LlmToolCall(block.path("id").asText(""), block.path("name").asText(""),
                            block.path("input").toString()));
                }
            }
        }
        String stopReason = response != null ? response.path("stop_reason").asText("stop") : "stop";
        return new LlmResponse(text.toString(), calls, stopReason);
    }

    private JsonNode readTree(String json) {
        try {
            return (json == null || json.isBlank()) ? mapper.createObjectNode() : mapper.readTree(json);
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }
}
