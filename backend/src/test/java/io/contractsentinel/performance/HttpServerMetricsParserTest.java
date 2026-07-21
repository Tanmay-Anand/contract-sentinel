package io.contractsentinel.performance;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HttpServerMetricsParserTest {

    // A minimal Prometheus scrape containing one endpoint with pre-computed quantiles.
    private static final String FULL_QUANTILE_BODY = """
            # HELP http_server_requests_seconds Duration of HTTP server request handling
            # TYPE http_server_requests_seconds summary
            http_server_requests_seconds{method="GET",uri="/api/units",status="200",outcome="SUCCESS",exception="None",quantile="0.5"} 0.012 1700000000000
            http_server_requests_seconds{method="GET",uri="/api/units",status="200",outcome="SUCCESS",exception="None",quantile="0.95"} 0.045 1700000000000
            http_server_requests_seconds{method="GET",uri="/api/units",status="200",outcome="SUCCESS",exception="None",quantile="0.99"} 0.120 1700000000000
            http_server_requests_seconds_count{method="GET",uri="/api/units",status="200",outcome="SUCCESS",exception="None"} 100
            http_server_requests_seconds_sum{method="GET",uri="/api/units",status="200",outcome="SUCCESS",exception="None"} 1.5
            http_server_requests_seconds_count{method="GET",uri="/api/units",status="500",outcome="SERVER_ERROR",exception="None"} 3
            http_server_requests_seconds_sum{method="GET",uri="/api/units",status="500",outcome="SERVER_ERROR",exception="None"} 0.9
            """;

    // Scrape WITHOUT quantile samples — service didn't enable percentile export.
    private static final String NO_QUANTILE_BODY = """
            http_server_requests_seconds_count{method="POST",uri="/api/bookings",status="201",outcome="SUCCESS",exception="None"} 50
            http_server_requests_seconds_sum{method="POST",uri="/api/bookings",status="201",outcome="SUCCESS",exception="None"} 2.0
            http_server_requests_seconds_max{method="POST",uri="/api/bookings",status="201",outcome="SUCCESS",exception="None"} 0.200
            """;

    // Noise paths that should be filtered out.
    private static final String NOISE_BODY = """
            http_server_requests_seconds_count{method="GET",uri="/actuator/health",status="200",outcome="SUCCESS",exception="None"} 999
            http_server_requests_seconds_count{method="GET",uri="/v3/api-docs",status="200",outcome="SUCCESS",exception="None"} 10
            """;

    @Test
    void parse_withPreComputedQuantiles_populatesAllPercentiles() {
        List<ParsedEndpointMetric> metrics = HttpServerMetricsParser.parse(FULL_QUANTILE_BODY);

        assertThat(metrics).hasSize(1);
        ParsedEndpointMetric m = metrics.get(0);
        assertThat(m.method()).isEqualTo("GET");
        assertThat(m.uri()).isEqualTo("/api/units");
        assertThat(m.p50Ms()).isEqualTo(12.0);
        assertThat(m.p95Ms()).isEqualTo(45.0);
        assertThat(m.p99Ms()).isEqualTo(120.0);
        assertThat(m.count()).isEqualTo(103);     // 100 + 3 from two label combos
        assertThat(m.errorCount()).isEqualTo(3);
    }

    @Test
    void parse_withPreComputedQuantiles_computesMeanFromSumAndCount() {
        List<ParsedEndpointMetric> metrics = HttpServerMetricsParser.parse(FULL_QUANTILE_BODY);

        assertThat(metrics).hasSize(1);
        double expectedMeanMs = (1.5 + 0.9) / 103.0 * 1000.0;
        assertThat(metrics.get(0).meanMs()).isCloseTo(expectedMeanMs, org.assertj.core.data.Offset.offset(0.01));
    }

    @Test
    void parse_withoutQuantiles_percentilesMustBeNull() {
        List<ParsedEndpointMetric> metrics = HttpServerMetricsParser.parse(NO_QUANTILE_BODY);

        assertThat(metrics).hasSize(1);
        ParsedEndpointMetric m = metrics.get(0);
        // Percentiles are null when the service didn't publish pre-computed quantiles.
        // Using max/mean as a stand-in for p99/p50 is dishonest — they must be null.
        assertThat(m.p50Ms()).isNull();
        assertThat(m.p95Ms()).isNull();
        assertThat(m.p99Ms()).isNull();
        // meanMs is always computable
        assertThat(m.meanMs()).isCloseTo(2.0 / 50.0 * 1000.0, org.assertj.core.data.Offset.offset(0.01));
    }

    @Test
    void parse_filtersNoiseAndActuatorPaths() {
        List<ParsedEndpointMetric> metrics = HttpServerMetricsParser.parse(NOISE_BODY);
        assertThat(metrics).isEmpty();
    }

    @Test
    void parse_nullOrBlankBody_returnsEmptyList() {
        assertThat(HttpServerMetricsParser.parse(null)).isEmpty();
        assertThat(HttpServerMetricsParser.parse("")).isEmpty();
        assertThat(HttpServerMetricsParser.parse("   ")).isEmpty();
    }
}
