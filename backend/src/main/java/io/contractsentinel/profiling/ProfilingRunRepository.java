package io.contractsentinel.profiling;

import io.contractsentinel.registry.ServiceRegistry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ProfilingRunRepository extends JpaRepository<ProfilingRun, UUID> {

    List<ProfilingRun> findByServiceOrderByStartedAtDesc(ServiceRegistry service);

    boolean existsByServiceAndStatusIn(ServiceRegistry service, List<ProfilingRun.Status> statuses);
}
