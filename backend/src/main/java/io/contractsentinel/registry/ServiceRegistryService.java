package io.contractsentinel.registry;

import java.util.List;
import java.util.UUID;

public interface ServiceRegistryService {

    List<ServiceRegistryDto> findAll();

    ServiceRegistryDto findById(UUID id);
}
