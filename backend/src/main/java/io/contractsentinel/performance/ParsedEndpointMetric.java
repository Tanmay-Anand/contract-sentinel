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
        /** Null when the service did not publish a {@code 0.5} quantile. */
        Double p50Ms,
        /** Null when the service did not publish a {@code 0.95} quantile. */
        Double p95Ms,
        /** Null when the service did not publish a {@code 0.99} quantile. */
        Double p99Ms,
        /** Arithmetic mean (sum/count). Always computable; never a proxy for a percentile. */
        Double meanMs
) {}
