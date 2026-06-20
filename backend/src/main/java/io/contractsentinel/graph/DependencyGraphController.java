package io.contractsentinel.graph;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Dependency Graph", description = "Service dependency topology and blast radius")
public class DependencyGraphController {

    private final DependencyGraphService dependencyGraphService;
    private final SharedDbSchemaService sharedDbSchemaService;

    @GetMapping("/graph")
    @Operation(summary = "Get the full service dependency graph (nodes + edges)")
    public ServiceGraphDto getGraph() {
        return dependencyGraphService.getGraph();
    }

    @PostMapping("/graph/scan")
    @Operation(summary = "Trigger an actuator/env dependency scan for all active services")
    public ResponseEntity<String> scanAll() {
        dependencyGraphService.scanAll();
        return ResponseEntity.ok("Dependency scan triggered for all active services");
    }

    @PostMapping("/dependencies")
    @Operation(summary = "Add a manual dependency edge between two services")
    public ServiceEdgeDto addManual(@RequestBody ManualDependencyRequest request) {
        return dependencyGraphService.addManual(request);
    }

    @DeleteMapping("/dependencies/{id}")
    @Operation(summary = "Remove a dependency edge by id")
    public ResponseEntity<Void> removeEdge(@PathVariable UUID id) {
        dependencyGraphService.removeEdge(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/dependencies/{id}/db-schema")
    @Operation(summary = "Return the PostgreSQL schema for a shared-database dependency edge")
    public java.util.List<SharedDbSchemaService.TableSchemaDto> getDbSchema(@PathVariable UUID id) {
        return sharedDbSchemaService.getSchemaForEdge(id);
    }

    @GetMapping("/graph/db-graph")
    @Operation(summary = "Return full database schema (tables + FK relationships) for all shared-database services")
    public java.util.List<SharedDbSchemaService.DbSchemaGroupDto> getDbGraph() {
        return sharedDbSchemaService.getDbGraph();
    }

    @GetMapping("/graph/blast-radius/{serviceId}")
    @Operation(summary = "Get the blast radius for a service — all services that transitively depend on it")
    public BlastRadiusDto getBlastRadius(@PathVariable UUID serviceId) {
        return dependencyGraphService.getBlastRadius(serviceId);
    }
}
