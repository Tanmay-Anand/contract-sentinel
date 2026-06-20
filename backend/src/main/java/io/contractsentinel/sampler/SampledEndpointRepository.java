package io.contractsentinel.sampler;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SampledEndpointRepository extends JpaRepository<SampledEndpoint, UUID> {

    List<SampledEndpoint> findAllByEnabledTrue();

    List<SampledEndpoint> findByService(ServiceRegistry service);
}
