package io.contractsentinel.snapshot;

import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
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

    private final SpecSnapshotRepository snapshotRepository;
    private final ServiceRegistryRepository serviceRepository;
    private final SpecFetcherScheduler fetcherScheduler;

    @GetMapping("/api/services/{serviceId}/snapshots")
    @Operation(summary = "List spec snapshots for a service, newest first")
    public Page<SpecSnapshotDto> listSnapshots(
            @PathVariable UUID serviceId,
            @PageableDefault(size = 20, sort = "fetchedAt", direction = Sort.Direction.DESC) Pageable pageable) {
        ServiceRegistry service = serviceRepository.findById(serviceId)
                .orElseThrow(() -> new IllegalArgumentException("Service not found: " + serviceId));
        return snapshotRepository.findByServiceOrderByFetchedAtDesc(service, pageable)
                .map(SpecSnapshotDto::from);
    }

    @PostMapping("/api/poll/now")
    @Operation(summary = "Trigger an immediate poll for all services")
    public ResponseEntity<String> pollAll() {
        fetcherScheduler.pollAll();
        return ResponseEntity.ok("Poll triggered for all active services");
    }

    @PostMapping("/api/poll/{serviceId}")
    @Operation(summary = "Trigger an immediate poll for a single service")
    public ResponseEntity<String> pollOne(@PathVariable UUID serviceId) {
        ServiceRegistry service = serviceRepository.findById(serviceId)
                .orElseThrow(() -> new IllegalArgumentException("Service not found: " + serviceId));
        fetcherScheduler.pollService(service);
        return ResponseEntity.ok("Poll triggered for " + service.getName());
    }
}
