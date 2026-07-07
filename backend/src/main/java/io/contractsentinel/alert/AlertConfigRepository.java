package io.contractsentinel.alert;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AlertConfigRepository extends JpaRepository<AlertConfig, UUID> {
    List<AlertConfig> findAllByEnabledTrue();
}
