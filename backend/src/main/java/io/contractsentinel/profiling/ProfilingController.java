package io.contractsentinel.profiling;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/profiling")
@RequiredArgsConstructor
@Tag(name = "JFR Profiler", description = "Method-level CPU hotspot profiling via Java Flight Recorder")
public class ProfilingController {

    private final ProfilingService profilingService;

    @PostMapping("/{serviceId}/start")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Start a JFR hotspot recording on a service")
    public ProfilingRunDto start(
            @PathVariable UUID serviceId,
            @RequestParam(defaultValue = "20") int durationSeconds) {
        return profilingService.start(serviceId, durationSeconds);
    }

    @GetMapping("/runs/{runId}")
    @Operation(summary = "Get a profiling run's status and (when complete) its hot methods")
    public ProfilingRunDto getRun(@PathVariable UUID runId) {
        return profilingService.getRun(runId);
    }

    @GetMapping("/{serviceId}/runs")
    @Operation(summary = "List past profiling runs for a service")
    public List<ProfilingRunDto> history(@PathVariable UUID serviceId) {
        return profilingService.history(serviceId);
    }
}
