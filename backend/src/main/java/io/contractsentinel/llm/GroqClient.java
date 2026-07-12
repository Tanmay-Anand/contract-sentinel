package io.contractsentinel.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * {@link LlmClient} for the Groq API. Groq exposes an OpenAI-compatible
 * Chat Completions endpoint at https://api.groq.com/openai/v1/chat/completions.
 */
@Slf4j
public class GroqClient implements LlmClient {

    private static final int MAX_RETRIES = 3;
    private static final Pattern RETRY_AFTER_PATTERN = Pattern.compile("try again in ([\\d.]+)s");

    private final LlmProperties.Groq config;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient restClient;

    public GroqClient(LlmProperties props) {
        this.config = props.getGroq();
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(5));
        f.setReadTimeout(Duration.ofSeconds(props.getRequestTimeoutSeconds()));
        this.restClient = RestClient.builder().requestFactory(f).build();
    }

    @Override
    public String provider() {
        return "groq:" + config.getModel();
    }

    @Override
    public LlmResponse chat(List<LlmMessage> messages, List<LlmToolSpec> tools) {
        if (config.getApiKey() == null || config.getApiKey().isBlank()) {
            throw new IllegalStateException("Groq API key is not configured (sentinel.llm.groq.api-key)");
        }

        ObjectNode body = mapper.createObjectNode();
        body.put("model", config.getModel());
        body.put("max_tokens", config.getMaxTokens());

        ArrayNode msgs = body.putArray("messages");
        for (LlmMessage m : messages) {
            switch (m.role()) {
                case SYSTEM -> msgs.add(simpleMessage("system", m.content()));
                case USER -> msgs.add(simpleMessage("user", m.content()));
                case ASSISTANT -> msgs.add(assistantMessage(m));
                case TOOL -> msgs.add(toolResultMessage(m));
            }
        }

        if (tools != null && !tools.isEmpty()) {
            ArrayNode toolArr = body.putArray("tools");
            for (LlmToolSpec t : tools) {
                ObjectNode tool = toolArr.addObject();
                tool.put("type", "function");
                ObjectNode fn = tool.putObject("function");
                fn.put("name", t.name());
                fn.put("description", t.description());
                fn.set("parameters", readTree(t.parametersJsonSchema()));
            }
        }

        JsonNode response = chatWithRetry(body);
        return parseResponse(response);
    }

    private JsonNode chatWithRetry(ObjectNode body) {
        for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                return restClient.post()
                        .uri(config.getBaseUrl() + "/v1/chat/completions")
                        .header("Authorization", "Bearer " + config.getApiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body.toString())
                        .retrieve()
                        .body(JsonNode.class);
            } catch (HttpClientErrorException.TooManyRequests e) {
                if (attempt == MAX_RETRIES) throw e;
                long waitMs = parseRetryAfterMs(e.getMessage()) + 1000L;
                log.warn("Groq rate limit hit, waiting {}ms before retry {}/{}", waitMs, attempt, MAX_RETRIES - 1);
                try { Thread.sleep(waitMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw e; }
            }
        }
        throw new IllegalStateException("unreachable");
    }

    private static long parseRetryAfterMs(String message) {
        if (message == null) return 20_000L;
        Matcher m = RETRY_AFTER_PATTERN.matcher(message);
        if (m.find()) {
            return (long) (Double.parseDouble(m.group(1)) * 1000);
        }
        return 20_000L;
    }

    private ObjectNode simpleMessage(String role, String content) {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("role", role);
        msg.put("content", content == null ? "" : content);
        return msg;
    }

    private ObjectNode assistantMessage(LlmMessage m) {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("role", "assistant");
        if (m.content() != null && !m.content().isBlank()) {
            msg.put("content", m.content());
        } else {
            msg.putNull("content");
        }
        if (m.toolCalls() != null && !m.toolCalls().isEmpty()) {
            ArrayNode calls = msg.putArray("tool_calls");
            for (LlmToolCall call : m.toolCalls()) {
                ObjectNode c = calls.addObject();
                c.put("id", call.id());
                c.put("type", "function");
                ObjectNode fn = c.putObject("function");
                fn.put("name", call.name());
                fn.put("arguments", call.argumentsJson() == null ? "{}" : call.argumentsJson());
            }
        }
        return msg;
    }

    private ObjectNode toolResultMessage(LlmMessage m) {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("role", "tool");
        msg.put("tool_call_id", m.toolCallId() == null ? "" : m.toolCallId());
        msg.put("content", m.content() == null ? "" : m.content());
        return msg;
    }

    private LlmResponse parseResponse(JsonNode response) {
        StringBuilder text = new StringBuilder();
        List<LlmToolCall> calls = new ArrayList<>();

        JsonNode choice = response != null && response.path("choices").isArray()
                ? response.path("choices").get(0) : null;
        if (choice == null) return new LlmResponse("", calls, "stop");

        JsonNode message = choice.path("message");
        if (message.path("content").isTextual()) {
            text.append(message.path("content").asText(""));
        }
        if (message.path("tool_calls").isArray()) {
            for (JsonNode call : message.path("tool_calls")) {
                String id = call.path("id").asText("");
                JsonNode fn = call.path("function");
                String name = fn.path("name").asText("");
                String args = fn.path("arguments").asText("{}");
                calls.add(new LlmToolCall(id, name, args));
            }
        }

        String finishReason = choice.path("finish_reason").asText("stop");
        return new LlmResponse(text.toString(), calls, finishReason);
    }

    private JsonNode readTree(String json) {
        try {
            return (json == null || json.isBlank()) ? mapper.createObjectNode() : mapper.readTree(json);
        } catch (Exception e) {
            return mapper.createObjectNode();
        }
    }
}