package io.contractsentinel.infrastructure;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/infrastructure")
@RequiredArgsConstructor
@Tag(name = "Infrastructure", description = "Docker containers and gateway health")
public class InfrastructureController {

    private final InfrastructureService infrastructureService;

    @GetMapping("/containers")
    public List<ContainerDto> listContainers() {
        return infrastructureService.listContainers();
    }

    @GetMapping("/gateway-health")
    public List<GatewayHealthDto> checkGatewayHealth() {
        return infrastructureService.checkGatewayHealth();
    }

    @PostMapping("/nginx/parse")
    public List<NginxRoute> parseNginxConfig(@RequestBody String configText) {
        return infrastructureService.parseNginxConfig(configText);
    }
}
