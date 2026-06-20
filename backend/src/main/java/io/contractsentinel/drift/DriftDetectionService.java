package io.contractsentinel.drift;

import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.snapshot.SpecSnapshot;

public interface DriftDetectionService {

    void detectAndPersist(ServiceRegistry service, SpecSnapshot prev, SpecSnapshot curr);
}
