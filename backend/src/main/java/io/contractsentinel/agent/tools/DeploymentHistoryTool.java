package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.agent.AgentTool;
import io.contractsentinel.deployment.DeploymentService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

/** Lists recent deployments for a service so the agent can correlate regressions with releases. */
@Component
@RequiredArgsConstructor
public class DeploymentHistoryTool implements AgentTool {

    private final DeploymentService deploymentService;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String name() {
        return "deployment_history";
    }

    @Override
    public String description() {
        return "List the most recent deployments (git commit/branch/build time) for a service.";
    }

    @Override
    public String parametersJsonSchema() {
        return """
            {"type":"object","properties":{"service":{"type":"string"}},"required":["service"]}
            """;
    }

    @Override
    public String execute(JsonNode args) throws Exception {
        ServiceRegistry service = ToolSupport.resolveService(serviceRegistryRepository, args);
        var page = deploymentService.listByService(service.getId(), PageRequest.of(0, 5));
        if (page.isEmpty()) {
            return "No deployments recorded for " + service.getName();
        }
        return mapper.writeValueAsString(page.getContent());
    }
}
