package io.contractsentinel.registry;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/services")
@RequiredArgsConstructor
@Tag(name = "Service Registry", description = "Monitored services")
public class ServiceRegistryController {

    private final ServiceRegistryService service;

    @GetMapping
    @Operation(summary = "List all registered services with their current health status")
    public List<ServiceRegistryDto> findAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a single service by ID")
    public ResponseEntity<ServiceRegistryDto> findById(@PathVariable UUID id) {
        return ResponseEntity.ok(service.findById(id));
    }
}
