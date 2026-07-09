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
 * {@link LlmClient} for a local Ollama server. Uses native tool-calling when enabled; otherwise
 * falls back to describing the tools in the prompt and parsing a JSON decision from the reply â€”
 * small local models frequently ignore the native tools API, so the fallback keeps agents working.
 */
@Slf4j
public class OllamaClient implements LlmClient {

    private final LlmProperties.Ollama config;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient restClient;

    public OllamaClient(LlmProperties props) {
        this.config = props.getOllama();
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(5));
        f.setReadTimeout(Duration.ofSeconds(props.getRequestTimeoutSeconds()));
        this.restClient = RestClient.builder().requestFactory(f).build();
    }

    @Override
    public String provider() {
        return "ollama:" + config.getModel();
    }

    @Override
    public LlmResponse chat(List<LlmMessage> messages, List<LlmToolSpec> tools) {
        boolean useNative = config.isNativeTools() && tools != null && !tools.isEmpty();
        ObjectNode body = mapper.createObjectNode();
        body.put("model", config.getModel());
        body.put("stream", false);

        ArrayNode msgs = body.putArray("messages");
        if (!useNative && tools != null && !tools.isEmpty()) {
            msgs.add(mapper.createObjectNode().put("role", "system").put("content", fallbackInstruction(tools)));
        }
        for (LlmMessage m : messages) {
            msgs.add(toOllamaMessage(m));
        }
        if (useNative) {
            ArrayNode toolArr = body.putArray("tools");
            for (LlmToolSpec t : tools) {
                toolArr.add(toOllamaTool(t));
            }
        }

        JsonNode response = restClient.post()
                .uri(config.getBaseUrl() + "/api/chat")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body.toString())
                .retrieve()
                .body(JsonNode.class);

        JsonNode message = response == null ? null : response.path("message");
        String content = message != null ? message.path("content").asText("") : "";

        if (useNative) {
            List<LlmToolCall> calls = new ArrayList<>();
            JsonNode toolCalls = message != null ? message.path("tool_calls") : null;
            if (toolCalls != null && toolCalls.isArray()) {
                int i = 0;
                for (JsonNode tc : toolCalls) {
                    JsonNode fn = tc.path("function");
                    calls.add(new LlmToolCall("call_" + (i++), fn.path("name").asText(""),
                            fn.path("arguments").toString()));
                }
            }
            return new LlmResponse(content, calls, calls.isEmpty() ? "stop" : "tool_calls");
        }
        return parseFallback(content);
    }

    private ObjectNode toOllamaMessage(LlmMessage m) {
        ObjectNode node = mapper.createObjectNode();
        node.put("role", m.role().name().toLowerCase());
        node.put("content", m.content() == null ? "" : m.content());
        if (m.toolCalls() != null && !m.toolCalls().isEmpty()) {
            ArrayNode tc = node.putArray("tool_calls");
            for (LlmToolCall call : m.toolCalls()) {
                ObjectNode fn = tc.addObject().putObject("function");
                fn.put("name", call.name());
                fn.set("arguments", readTree(call.argumentsJson()));
            }
        }
        return node;
    }

    private ObjectNode toOllamaTool(LlmToolSpec t) {
        ObjectNode tool = mapper.createObjectNode();
        tool.put("type", "function");
        ObjectNode fn = tool.putObject("function");
        fn.put("name", t.name());
        fn.put("description", t.description());
        fn.set("parameters", readTree(t.parametersJsonSchema()));
        return tool;
    }

    private String fallbackInstruction(List<LlmToolSpec> tools) {
        StringBuilder sb = new StringBuilder("You can call tools. Available tools (JSON schema):\n");
        for (LlmToolSpec t : tools) {
            sb.append("- ").append(t.name()).append(": ").append(t.description())
                    .append(" params=").append(t.parametersJsonSchema()).append('\n');
        }
        sb.append("\nTo call a tool, reply with ONLY: {\"tool\":\"<name>\",\"arguments\":{...}}\n");
        sb.append("To give your final answer, reply with ONLY: {\"answer\":\"<markdown>\"}\n");
        sb.append("Do not include any other text or code fences.");
        return sb.toString();
    }

    private LlmResponse parseFallback(String content) {
        String json = extractJson(content);
        if (json != null) {
            try {
                JsonNode node = mapper.readTree(json);
                if (node.has("tool")) {
                    LlmToolCall call = new LlmToolCall("call_0", node.path("tool").asText(""),
                            node.path("arguments").isMissingNode() ? "{}" : node.path("arguments").toString());
                    return new LlmResponse("", List.of(call), "tool_calls");
                }
                if (node.has("answer")) {
                    return new LlmResponse(node.path("answer").asText(""), List.of(), "stop");
                }
            } catch (Exception e) {
                log.debug("Ollama fallback JSON parse failed: {}", e.getMessage());
            }
        }
        return new LlmResponse(content, List.of(), "stop");
    }

    private static String extractJson(String text) {
        if (text == null) return null;
        String cleaned = text.replaceAll("(?s)```(?:json)?", "").trim();
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return cleaned.substring(start, end + 1);
        }
        return null;
    }

    private JsonNode readTree(String json) {
        try {
            return (json == null || json.isBlank()) ? mapper.createObjectNode() : mapper.readTree(json);
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }
}
