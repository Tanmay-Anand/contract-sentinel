package io.contractsentinel.sampler;

import java.util.List;

/**
 * Payload-size vs response-time correlation for a sampled endpoint. A near-linear relationship is
 * healthy serialisation cost; a flat one suggests caching; an exponential one is the classic N+1
 * signal (more list items â†’ disproportionately more DB work).
 */
public record CorrelationResponse(
        boolean sufficient,
        int n,
        Double r,
        Double slope,
        String classification,
        List<Point> points
) {
    public record Point(long sizeBytes, long durationMs) {}

    public static CorrelationResponse insufficient(int n) {
        return new CorrelationResponse(false, n, null, null, "insufficient", List.of());
    }
}
