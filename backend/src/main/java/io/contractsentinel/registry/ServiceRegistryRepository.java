package io.contractsentinel.registry;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ServiceRegistryRepository extends JpaRepository<ServiceRegistry, UUID> {

    List<ServiceRegistry> findAllByActiveTrue();

    Optional<ServiceRegistry> findByName(String name);

    boolean existsByName(String name);
}
