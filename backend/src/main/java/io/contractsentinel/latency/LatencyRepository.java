package io.contractsentinel.latency;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface LatencyRepository extends JpaRepository<LatencyMetric, UUID> {

    java.util.Optional<LatencyMetric> findTopByServiceOrderByRecordedAtDesc(ServiceRegistry service);

    List<LatencyMetric> findByServiceOrderByRecordedAtDesc(ServiceRegistry service, Pageable pageable);

    List<LatencyMetric> findByServiceAndRecordedAtBetweenOrderByRecordedAt(ServiceRegistry service, Instant from, Instant to);
}
