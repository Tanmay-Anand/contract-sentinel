package io.contractsentinel.trace;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/traces")
@RequiredArgsConstructor
@Tag(name = "Traces", description = "Distributed request traces collected from Builder-CRM services")
public class TraceController {

    private final TraceService traceService;

    @PostMapping("/zipkin")
    @Operation(summary = "Ingest Zipkin v2 spans (called continuously by the Builder-CRM tracers)")
    public ResponseEntity<Void> ingest(@RequestBody List<ZipkinSpanDto> spans) {
        traceService.ingest(spans);
        return ResponseEntity.accepted().build();
    }

    @GetMapping
    @Operation(summary = "List recent traces, newest first")
    public List<TraceSummaryDto> list(
            @RequestParam(required = false) String serviceName,
            @RequestParam(required = false) Long minDurationMs,
            @RequestParam(defaultValue = "60") int sinceMinutes,
            @RequestParam(defaultValue = "50") int limit) {
        return traceService.listTraces(serviceName, minDurationMs, sinceMinutes, limit);
    }

    @GetMapping("/{traceId}")
    @Operation(summary = "Get a single assembled trace as an ordered waterfall")
    public TraceTreeDto get(@PathVariable String traceId) {
        return traceService.getTrace(traceId);
    }
}
