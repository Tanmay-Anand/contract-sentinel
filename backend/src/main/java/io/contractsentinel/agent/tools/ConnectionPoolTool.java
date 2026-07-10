package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.contractsentinel.agent.AgentTool;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/** Reads HikariCP connection-pool gauges to check for pending/exhausted connections. */
@Component
@RequiredArgsConstructor
public class ConnectionPoolTool implements AgentTool {

    private final ServiceRegistryRepository serviceRegistryRepository;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().requestFactory(factory()).build();

    private static SimpleClientHttpRequestFactory factory() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(3));
        f.setReadTimeout(Duration.ofSeconds(8));
        return f;
    }

    @Override
    public String name() {
        return "connection_pool";
    }

    @Override
    public String description() {
        return "Read HikariCP pool metrics (pending, active, idle, max connections) for a service.";
    }

    @Override
    public String parametersJsonSchema() {
        return """
            {"type":"object","properties":{"service":{"type":"string"}},"required":["service"]}
            """;
    }

    @Override
    public String execute(JsonNode args) {
        ServiceRegistry service = ToolSupport.resolveService(serviceRegistryRepository, args);
        String base = service.getBaseUrl() + contextPathFrom(service.getSpecPath()) + "/actuator/metrics/";
        ObjectNode out = mapper.createObjectNode();
        out.put("service", service.getName());
        out.put("pending", gauge(base, "hikaricp.connections.pending"));
        out.put("active", gauge(base, "hikaricp.connections.active"));
        out.put("idle", gauge(base, "hikaricp.connections.idle"));
        out.put("max", gauge(base, "hikaricp.connections.max"));
        return out.toString();
    }

    private Double gauge(String base, String metric) {
        try {
            JsonNode node = restClient.get().uri(base + metric).retrieve().body(JsonNode.class);
            if (node != null && node.path("measurements").isArray() && node.path("measurements").size() > 0) {
                return node.path("measurements").get(0).path("value").asDouble();
            }
        } catch (Exception ignored) {
            // metric unavailable
        }
        return null;
    }

    private static String contextPathFrom(String specPath) {
        if (specPath == null) return "";
        int idx = specPath.lastIndexOf("/v3/api-docs");
        if (idx <= 0) return "";
        return specPath.substring(0, idx);
    }
}
