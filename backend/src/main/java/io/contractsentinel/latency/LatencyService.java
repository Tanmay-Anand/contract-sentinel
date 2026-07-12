package io.contractsentinel.latency;

import io.contractsentinel.registry.ServiceRegistry;

import java.util.List;
import java.util.UUID;

public interface LatencyService {

    void recordSpecFetch(ServiceRegistry service, long durationMs);

    void collectFromActuator(ServiceRegistry service);

    /** Enrich the most-recent LatencyMetric for this service with Prometheus-derived percentiles and dominant endpoint. */
    void updateLatestWithPrometheusData(ServiceRegistry service, Double p95Ms, Double p50Ms,
                                        String dominantMethod, String dominantPath);

    List<LatencyMetricDto> getTimeSeries(UUID serviceId, int limitPoints);
}
