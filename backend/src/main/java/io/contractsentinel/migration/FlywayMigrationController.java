package io.contractsentinel.migration;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/flyway")
@RequiredArgsConstructor
public class FlywayMigrationController {

    private final FlywayMigrationService flywayMigrationService;
    private final ServiceRegistryRepository serviceRegistryRepository;

    @GetMapping("/summary")
    public List<FlywayServiceSummaryDto> getSummary() {
        return flywayMigrationService.getAllSummaries();
    }

    @GetMapping("/services/{serviceId}")
    public List<FlywayMigrationRecordDto> getMigrations(
            @PathVariable UUID serviceId,
            @RequestParam(required = false) String state) {
        return flywayMigrationService.getMigrations(serviceId, state);
    }

    @PostMapping("/services/{serviceId}/sync")
    public ResponseEntity<Void> sync(@PathVariable UUID serviceId) {
        ServiceRegistry svc = serviceRegistryRepository.findById(serviceId).orElse(null);
        if (svc == null) return ResponseEntity.notFound().build();
        flywayMigrationService.syncFromActuator(svc);
        flywayMigrationService.syncFromFilesystem(svc);
        return ResponseEntity.ok().build();
    }
}
