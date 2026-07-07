package io.contractsentinel.graph;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ServiceDependencyRepository extends JpaRepository<ServiceDependency, UUID> {

    List<ServiceDependency> findBySourceService(ServiceRegistry source);

    List<ServiceDependency> findByTargetService(ServiceRegistry target);

    List<ServiceDependency> findByTargetServiceId(UUID targetId);

    Optional<ServiceDependency> findBySourceServiceAndTargetServiceAndDetectionMethod(
            ServiceRegistry source, ServiceRegistry target, ServiceDependency.DetectionMethod method);
}
