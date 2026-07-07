package io.contractsentinel.deployment;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface DeploymentService {

    void detectAndRecord(ServiceRegistry service, Map<String, Object> actuatorInfo);

    Page<DeploymentEventDto> listByService(UUID serviceId, Pageable pageable);

    Optional<DeploymentEventDto> latestByService(UUID serviceId);
}
