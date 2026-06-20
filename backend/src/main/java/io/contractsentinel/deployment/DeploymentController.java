package io.contractsentinel.deployment;

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
@Tag(name = "Deployments", description = "Deployment event tracking via /actuator/info")
public class DeploymentController {

    private final DeploymentService deploymentService;

    @GetMapping("/api/services/{serviceId}/deployments")
    @Operation(summary = "List deployment events for a service, most recent first")
    public Page<DeploymentEventDto> listDeployments(
            @PathVariable UUID serviceId,
            @PageableDefault(size = 20, sort = "detectedAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return deploymentService.listByService(serviceId, pageable);
    }

    @GetMapping("/api/services/{serviceId}/deployments/latest")
    @Operation(summary = "Get the most recent deployment event for a service")
    public ResponseEntity<DeploymentEventDto> latestDeployment(@PathVariable UUID serviceId) {
        return deploymentService.latestByService(serviceId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
