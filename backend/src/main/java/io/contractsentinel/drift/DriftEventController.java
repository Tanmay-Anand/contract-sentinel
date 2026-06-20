package io.contractsentinel.drift;

import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.graph.BlastRadiusDto;
import io.contractsentinel.graph.DependencyGraphService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/drift")
@RequiredArgsConstructor
@Tag(name = "Drift Events", description = "API contract drift detection results")
public class DriftEventController {

    private final DriftEventService driftEventService;
    private final DriftEventRepository driftEventRepository;
    private final DependencyGraphService dependencyGraphService;

    @GetMapping
    @Operation(summary = "List all drift events, filterable by service and severity")
    public Page<DriftEventDto> list(
            @RequestParam(required = false) UUID serviceId,
            @RequestParam(required = false) String severity,
            @PageableDefault(size = 20, sort = "detectedAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return driftEventService.list(serviceId, severity, pageable);
    }

    @PostMapping("/{id}/acknowledge")
    @Operation(summary = "Acknowledge a drift event (marks it as reviewed)")
    public ResponseEntity<DriftEventDto> acknowledge(@PathVariable UUID id) {
        return ResponseEntity.ok(driftEventService.acknowledge(id));
    }

    @PostMapping("/{id}/unacknowledge")
    @Operation(summary = "Unacknowledge a drift event (clears the reviewed mark)")
    public ResponseEntity<DriftEventDto> unacknowledge(@PathVariable UUID id) {
        return ResponseEntity.ok(driftEventService.unacknowledge(id));
    }

    @GetMapping("/diff/{toSnapshotId}")
    @Operation(summary = "Get grouped diff for a snapshot — all drift events for the given toSnapshotId")
    public ResponseEntity<SpecDiffDto> getDiff(@PathVariable UUID toSnapshotId) {
        return ResponseEntity.ok(driftEventService.getDiff(toSnapshotId));
    }

    @GetMapping("/{driftEventId}/blast-radius")
    @Operation(summary = "Get the blast radius of the service that produced the given drift event")
    public ResponseEntity<BlastRadiusDto> getBlastRadius(@PathVariable UUID driftEventId) {
        DriftEvent driftEvent = driftEventRepository.findById(driftEventId)
                .orElseThrow(() -> SentinelException.notFound(
                        "Drift event not found: " + driftEventId, RequestContext.getRequestId()));
        BlastRadiusDto blastRadius = dependencyGraphService.getBlastRadius(driftEvent.getService().getId());
        return ResponseEntity.ok(blastRadius);
    }
}
