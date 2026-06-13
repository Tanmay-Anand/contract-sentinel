package io.contractsentinel.drift;

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
@RequestMapping("/api/drift")
@RequiredArgsConstructor
@Tag(name = "Drift Events", description = "API contract drift detection results")
public class DriftEventController {

    private final DriftEventRepository driftEventRepository;
    private final ServiceRegistryRepository serviceRepository;

    @GetMapping
    @Operation(summary = "List drift events, optionally filtered by service and/or severity")
    public Page<DriftEventDto> list(
            @RequestParam(required = false) UUID serviceId,
            @RequestParam(required = false) String severity,
            @PageableDefault(size = 20, sort = "detectedAt", direction = Sort.Direction.DESC) Pageable pageable) {

        if (serviceId != null && severity != null) {
            ServiceRegistry service = serviceRepository.findById(serviceId)
                    .orElseThrow(() -> new IllegalArgumentException("Service not found: " + serviceId));
            return driftEventRepository.findByServiceAndSeverityOrderByDetectedAtDesc(
                    service, DriftEvent.Severity.valueOf(severity.toUpperCase()), pageable)
                    .map(DriftEventDto::from);
        }

        if (serviceId != null) {
            ServiceRegistry service = serviceRepository.findById(serviceId)
                    .orElseThrow(() -> new IllegalArgumentException("Service not found: " + serviceId));
            return driftEventRepository.findByServiceOrderByDetectedAtDesc(service, pageable)
                    .map(DriftEventDto::from);
        }

        if (severity != null) {
            return driftEventRepository.findBySeverityOrderByDetectedAtDesc(
                    DriftEvent.Severity.valueOf(severity.toUpperCase()), pageable)
                    .map(DriftEventDto::from);
        }

        return driftEventRepository.findAllByOrderByDetectedAtDesc(pageable)
                .map(DriftEventDto::from);
    }

    @PostMapping("/{id}/acknowledge")
    @Operation(summary = "Acknowledge a drift event (marks it as reviewed)")
    public ResponseEntity<DriftEventDto> acknowledge(@PathVariable UUID id) {
        DriftEvent event = driftEventRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Drift event not found: " + id));
        event.setAcknowledged(true);
        return ResponseEntity.ok(DriftEventDto.from(driftEventRepository.save(event)));
    }
}
