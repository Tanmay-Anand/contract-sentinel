package io.contractsentinel.usage;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EndpointUsageRepository extends JpaRepository<EndpointUsageSample, UUID> {

    List<EndpointUsageSample> findByServiceOrderBySampledAtDesc(ServiceRegistry service, Pageable pageable);

    Optional<EndpointUsageSample> findTopByServiceAndHttpMethodAndPathOrderBySampledAtDesc(ServiceRegistry service, String method, String path);

    List<EndpointUsageSample> findByServiceAndSampledAtAfterOrderBySampledAt(ServiceRegistry service, Instant after);
}
