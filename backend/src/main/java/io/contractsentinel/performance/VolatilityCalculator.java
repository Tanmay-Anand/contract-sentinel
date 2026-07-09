package io.contractsentinel.performance;

import java.util.List;

/**
 * Scores how consistent an endpoint's latency is over time using the coefficient of variation
 * (CV = stddev / mean) of its p95 series. High CV means the endpoint is unpredictable â€” often a
 * sign of intermittent cache misses or lock contention â€” which is a distinct, more actionable
 * signal than raw slowness.
 */
public final class VolatilityCalculator {

    public static final String INSUFFICIENT_DATA = "INSUFFICIENT_DATA";
    public static final String STABLE = "STABLE";
    public static final String MODERATE = "MODERATE";
    public static final String VOLATILE = "VOLATILE";
    public static final String ERRATIC = "ERRATIC";

    private static final int MIN_POINTS = 8;

    private VolatilityCalculator() {}

    public record Result(Double cv, String rating) {}

    public static Result compute(List<Double> series) {
        List<Double> values = series == null ? List.of() : series.stream().filter(v -> v != null && v >= 0).toList();
        if (values.size() < MIN_POINTS) {
            return new Result(null, INSUFFICIENT_DATA);
        }
        double mean = values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        if (mean <= 0) {
            return new Result(0.0, STABLE);
        }
        double variance = values.stream()
                .mapToDouble(v -> (v - mean) * (v - mean))
                .average()
                .orElse(0);
        double cv = Math.sqrt(variance) / mean;
        return new Result(cv, rate(cv));
    }

    private static String rate(double cv) {
        if (cv < 0.15) return STABLE;
        if (cv < 0.35) return MODERATE;
        if (cv < 0.70) return VOLATILE;
        return ERRATIC;
    }
}
