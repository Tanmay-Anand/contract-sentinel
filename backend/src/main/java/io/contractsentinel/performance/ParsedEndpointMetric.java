package io.contractsentinel.performance;

/**
 * One endpoint's aggregated HTTP-server metrics parsed from a service's {@code /actuator/prometheus}
 * output. Percentiles are in milliseconds and may be {@code null} when the service did not publish
 * pre-computed quantiles (in which case p50 falls back to the mean and p99 to the max).
 */
public record ParsedEndpointMetric(
        String method,
        String uri,
        long count,
        long errorCount,
        Double p50Ms,
        Double p95Ms,
        Double p99Ms
) {}
