package io.contractsentinel.latency;

import io.contractsentinel.registry.ServiceRegistry;

import java.util.List;
import java.util.UUID;

public interface LatencyService {

    void recordSpecFetch(ServiceRegistry service, long durationMs);

    void collectFromActuator(ServiceRegistry service);

    /**
     * @deprecated p95Ms/p50Ms are now derived from {@code cs_endpoint_performance_snapshots}
     * via {@link io.contractsentinel.performance.EndpointPerformanceSnapshotRepository#aggregateServiceLatency}.
     * This method is a no-op and will be removed in a future cleanup.
     */
    @Deprecated
    void updateLatestWithPrometheusData(ServiceRegistry service, Double p95Ms, Double p50Ms,
                                        String dominantMethod, String dominantPath);

    List<LatencyMetricDto> getTimeSeries(UUID serviceId, int limitPoints);
}
