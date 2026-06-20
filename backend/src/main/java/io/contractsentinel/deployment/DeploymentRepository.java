package io.contractsentinel.deployment;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DeploymentRepository extends JpaRepository<DeploymentEvent, UUID> {
    Page<DeploymentEvent> findByServiceOrderByDetectedAtDesc(ServiceRegistry service, Pageable pageable);
    Optional<DeploymentEvent> findTopByServiceOrderByDetectedAtDesc(ServiceRegistry service);
}
