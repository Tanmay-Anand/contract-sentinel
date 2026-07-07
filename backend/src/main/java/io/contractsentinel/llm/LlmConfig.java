package io.contractsentinel.llm;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@Slf4j
public class LlmConfig {

    @Bean
    public LlmClient llmClient(LlmProperties properties) {
        String provider = properties.getProvider() == null ? "ollama" : properties.getProvider().trim().toLowerCase();
        log.info("Configuring LLM client for provider '{}'", provider);
        return switch (provider) {
            case "claude", "anthropic" -> new ClaudeClient(properties);
            default -> new OllamaClient(properties);
        };
    }
}
