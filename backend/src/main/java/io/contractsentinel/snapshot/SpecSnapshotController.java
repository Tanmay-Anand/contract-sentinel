package io.contractsentinel.snapshot;

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
@RequiredArgsConstructor
@Tag(name = "Snapshots & Polling", description = "Spec snapshots and manual poll triggers")
public class SpecSnapshotController {

    private final SpecSnapshotService specSnapshotService;

    @GetMapping("/api/services/{serviceId}/snapshots")
    @Operation(summary = "List spec snapshots for a service, newest first")
    public Page<SpecSnapshotDto> listSnapshots(
            @PathVariable UUID serviceId,
            @PageableDefault(size = 20, sort = "fetchedAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return specSnapshotService.listByService(serviceId, pageable);
    }

    @PostMapping("/api/poll/now")
    @Operation(summary = "Trigger an immediate poll for all services")
    public ResponseEntity<String> pollAll() {
        return ResponseEntity.ok(specSnapshotService.pollAll());
    }

    @PostMapping("/api/poll/{serviceId}")
    @Operation(summary = "Trigger an immediate poll for a single service")
    public ResponseEntity<String> pollOne(@PathVariable UUID serviceId) {
        return ResponseEntity.ok(specSnapshotService.pollOne(serviceId));
    }

    @PostMapping("/api/services/{serviceId}/redetect")
    @Operation(summary = "Re-run drift detection between the oldest and newest snapshot for a service",
               description = "Useful when the sentinel missed the transition (e.g. first poll had no previous baseline). " +
                             "Compares the very first captured spec against the current one and surfaces all accumulated changes.")
    public ResponseEntity<String> redetect(@PathVariable UUID serviceId) {
        return ResponseEntity.ok(specSnapshotService.redetect(serviceId));
    }
}
