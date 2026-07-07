package io.contractsentinel.performance;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/performance")
@RequiredArgsConstructor
@Tag(name = "Performance Registry", description = "Per-endpoint latency, error rate, size, ranking and volatility")
public class EndpointPerformanceController {

    private final EndpointPerformanceService performanceService;

    @GetMapping("/registry")
    @Operation(summary = "Latest performance reading for every endpoint (sortable/filterable client-side)")
    public List<EndpointPerformanceRow> registry(
            @RequestParam(required = false) UUID serviceId,
            @RequestParam(required = false) String method,
            @RequestParam(required = false, name = "q") String query) {
        return performanceService.registry(serviceId, method, query);
    }

    @GetMapping("/history")
    @Operation(summary = "Full historical latency series for a single endpoint")
    public EndpointPerformanceDetail history(
            @RequestParam UUID serviceId,
            @RequestParam String method,
            @RequestParam String path,
            @RequestParam(defaultValue = "7") int days) {
        return performanceService.history(serviceId, method, path, days);
    }
}
