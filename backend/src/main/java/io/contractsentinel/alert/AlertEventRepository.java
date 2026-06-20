package io.contractsentinel.alert;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AlertEventRepository extends JpaRepository<AlertEvent, UUID> {
    List<AlertEvent> findTop50ByOrderByFiredAtDesc();
    Optional<AlertEvent> findTopByConfigIdAndServiceIdOrderByFiredAtDesc(UUID configId, UUID serviceId);
}
