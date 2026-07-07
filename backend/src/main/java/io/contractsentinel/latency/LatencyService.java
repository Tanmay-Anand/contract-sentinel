package io.contractsentinel.latency;

import io.contractsentinel.registry.ServiceRegistry;

import java.util.List;
import java.util.UUID;

public interface LatencyService {

    void recordSpecFetch(ServiceRegistry service, long durationMs);

    void collectFromActuator(ServiceRegistry service);

    List<LatencyMetricDto> getTimeSeries(UUID serviceId, int limitPoints);
}
