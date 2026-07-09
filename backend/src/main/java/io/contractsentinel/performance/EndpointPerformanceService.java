package io.contractsentinel.performance;

import io.contractsentinel.registry.ServiceRegistry;

import java.util.List;
import java.util.UUID;

public interface EndpointPerformanceService {

    /** Scrape the service's Prometheus endpoint and persist one snapshot per observed endpoint. */
    void collectForService(ServiceRegistry service);

    /** Latest reading per endpoint (optionally filtered), enriched with ranking/volatility/sparkline. */
    List<EndpointPerformanceRow> registry(UUID serviceId, String method, String query);

    /** Full history for a single endpoint over the given window. */
    EndpointPerformanceDetail history(UUID serviceId, String method, String path, int days);

    /** Delete snapshots older than the retention window. */
    void purgeOlderThan(int retentionDays);
}
