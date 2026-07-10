package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.agent.AgentTool;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.usage.UsageAnalyticsService;
import io.contractsentinel.usage.UsageEntryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;

/** Reports request-count activity per endpoint so the agent can spot unusually hot endpoints. */
@Component
@RequiredArgsConstructor
public class UsageTrendTool implements AgentTool {

    private final UsageAnalyticsService usageAnalyticsService;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String name() {
        return "usage_trend";
    }

    @Override
    public String description() {
        return "Get per-endpoint request counts (total and recent delta) for a service, busiest first.";
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
        List<UsageEntryDto> summary = usageAnalyticsService.getSummary(service.getId());
        if (summary.isEmpty()) {
            return "No usage data for " + service.getName();
        }
        List<UsageEntryDto> top = summary.stream()
                .sorted(Comparator.comparingLong(UsageEntryDto::totalCount).reversed())
                .limit(15)
                .toList();
        return mapper.writeValueAsString(top);
    }
}
