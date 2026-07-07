package io.contractsentinel.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@Data
@ConfigurationProperties(prefix = "sentinel")
public class SentinelProperties {

    private Poll poll = new Poll();
    private List<ServiceConfig> services = new ArrayList<>();
    private List<ManualDependencyConfig> manualDependencies = new ArrayList<>();

    @Data
    public static class Poll {
        private long intervalMs = 300_000;
        private long initialDelayMs = 15_000;
    }

    @Data
    public static class ServiceConfig {
        private String name;
        private String baseUrl;
        private String specPath = "/v3/api-docs";
    }

    @Data
    public static class ManualDependencyConfig {
        private String source;
        private String target;
        private String propertyName;
        private String endpointCallsJson;
    }
}
