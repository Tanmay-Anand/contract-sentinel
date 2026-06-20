package io.contractsentinel.latency;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/services")
@RequiredArgsConstructor
@Tag(name = "Latency", description = "Latency trending per service")
public class LatencyController {

    private final LatencyService latencyService;

    @GetMapping("/{serviceId}/latency")
    @Operation(summary = "Get latency time series for a service")
    public List<LatencyMetricDto> getTimeSeries(
            @PathVariable UUID serviceId,
            @RequestParam(defaultValue = "50") int limit) {
        return latencyService.getTimeSeries(serviceId, limit);
    }
}
