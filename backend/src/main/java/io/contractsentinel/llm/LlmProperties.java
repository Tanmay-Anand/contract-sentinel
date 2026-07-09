package io.contractsentinel.llm;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Configuration for the pluggable LLM backend (Ollama by default, Claude opt-in). */
@Component
@ConfigurationProperties(prefix = "sentinel.llm")
@Getter
@Setter
public class LlmProperties {

    /** {@code ollama} or {@code claude}. */
    private String provider = "ollama";
    private int maxIterations = 10;
    private int requestTimeoutSeconds = 120;

    private Ollama ollama = new Ollama();
    private Claude claude = new Claude();

    @Getter
    @Setter
    public static class Ollama {
        private String baseUrl = "http://localhost:11434";
        private String model = "qwen2.5:14b";
        /** When false, tools are described in the prompt and parsed from JSON (fallback for small models). */
        private boolean nativeTools = true;
    }

    @Getter
    @Setter
    public static class Claude {
        private String baseUrl = "https://api.anthropic.com";
        private String model = "claude-sonnet-4-5";
        private int maxTokens = 2048;
        /** Env: SENTINEL_LLM_CLAUDE_API_KEY. Never commit a real key. */
        private String apiKey = "";
    }
}
