package io.contractsentinel.performance;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Full historical series for a single endpoint, used by the row-detail latency chart. */
public record EndpointPerformanceDetail(
        UUID serviceId,
        String serviceName,
        String httpMethod,
        String path,
        List<Point> points
) {
    public record Point(
            Instant recordedAt,
            Double p50Ms,
            Double p95Ms,
            Double p99Ms,
            long countDelta,
            long errorCount
    ) {
        public static Point from(EndpointPerformanceSnapshot s) {
            return new Point(s.getRecordedAt(), s.getP50Ms(), s.getP95Ms(), s.getP99Ms(),
                    s.getCountDelta(), s.getErrorCount());
        }
    }
}
