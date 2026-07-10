package io.contractsentinel.performance;

import java.util.List;
import java.util.UUID;

/**
 * One row of the performance registry â€” the latest reading for an endpoint plus derived signals
 * (relative p99 ranking, volatility, a p95 sparkline) that no single actuator call can produce.
 */
public record EndpointPerformanceRow(
        UUID serviceId,
        String serviceName,
        String httpMethod,
        String path,
        long countDelta,
        Double p50Ms,
        Double p95Ms,
        Double p99Ms,
        double errorRatePct,
        Long responseSizeBytes,
        double p99MedianRatio,
        List<Double> p95Sparkline,
        Double volatilityCv,
        String volatilityRating
) {}
