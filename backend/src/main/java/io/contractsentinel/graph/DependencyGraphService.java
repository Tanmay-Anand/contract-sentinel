package io.contractsentinel.graph;

import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.trace.TraceSpan;

import java.util.List;
import java.util.UUID;

public interface DependencyGraphService {

    ServiceGraphDto getGraph();

    void scanDependencies(ServiceRegistry source);

    void scanAll();

    ServiceEdgeDto addManual(ManualDependencyRequest req);

    void removeEdge(UUID edgeId);

    BlastRadiusDto getBlastRadius(UUID serviceId);

    void deriveEdgesFromSpans(List<TraceSpan> spans);
}
