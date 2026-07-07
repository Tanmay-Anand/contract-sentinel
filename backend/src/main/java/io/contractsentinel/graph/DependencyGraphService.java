package io.contractsentinel.graph;

import io.contractsentinel.registry.ServiceRegistry;

import java.util.UUID;

public interface DependencyGraphService {

    ServiceGraphDto getGraph();

    void scanDependencies(ServiceRegistry source);

    void scanAll();

    ServiceEdgeDto addManual(ManualDependencyRequest req);

    void removeEdge(UUID edgeId);

    BlastRadiusDto getBlastRadius(UUID serviceId);
}
