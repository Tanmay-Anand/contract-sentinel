package io.contractsentinel.knowledge;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GraphMetricRepository extends JpaRepository<GraphMetric, UUID> {
    List<GraphMetric> findAllByApprovedAtIsNotNull();
    List<GraphMetric> findAllByApprovedAtIsNull();
    List<GraphMetric> findAllByServiceName(String serviceName);
    List<GraphMetric> findAllByServiceNameAndApprovedAtIsNotNull(String serviceName);
    List<GraphMetric> findAllByServiceNameAndApprovedAtIsNull(String serviceName);
    long countByServiceNameAndApprovedAtIsNotNull(String serviceName);
    long countByServiceNameAndApprovedAtIsNull(String serviceName);
    Optional<GraphMetric> findByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCase(String name);
}
