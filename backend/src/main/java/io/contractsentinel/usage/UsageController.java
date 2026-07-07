package io.contractsentinel.usage;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/services")
@RequiredArgsConstructor
@Tag(name = "Usage Analytics", description = "Endpoint traffic and dead endpoint detection")
public class UsageController {

    private final UsageAnalyticsService usageAnalyticsService;

    @GetMapping("/{serviceId}/usage/summary")
    @Operation(summary = "Get usage summary — latest sample per endpoint for a service")
    public List<UsageEntryDto> getSummary(@PathVariable UUID serviceId) {
        return usageAnalyticsService.getSummary(serviceId);
    }

    @GetMapping("/{serviceId}/usage/dead-endpoints")
    @Operation(summary = "Get endpoints with zero delta across last 5 samples (dead endpoints)")
    public List<DeadEndpointDto> getDeadEndpoints(@PathVariable UUID serviceId) {
        return usageAnalyticsService.getDeadEndpoints(serviceId);
    }
}
