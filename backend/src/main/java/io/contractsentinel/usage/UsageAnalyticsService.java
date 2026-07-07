package io.contractsentinel.usage;

import io.contractsentinel.registry.ServiceRegistry;

import java.util.List;
import java.util.UUID;

public interface UsageAnalyticsService {

    void collectForService(ServiceRegistry service, List<String> endpointPaths);

    List<UsageEntryDto> getSummary(UUID serviceId);

    List<DeadEndpointDto> getDeadEndpoints(UUID serviceId);
}
