package io.contractsentinel.latency;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.performance.EndpointPerformanceSnapshotRepository;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.stats.OutboundCallCounter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class LatencyServiceImpl implements LatencyService {

    private final LatencyRepository latencyRepository;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final EndpointPerformanceSnapshotRepository performanceSnapshotRepository;
    private final OutboundCallCounter callCounter;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final RestClient restClient = RestClient.builder()
            .requestFactory(factory())
            .build();

    private static SimpleClientHttpRequestFactory factory() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(5));
        f.setReadTimeout(Duration.ofSeconds(10));
        return f;
    }

    @Override
    @Transactional
    public void recordSpecFetch(ServiceRegistry service, long durationMs) {
        LatencyMetric metric = LatencyMetric.builder()
                .service(service)
                .specFetchMs(durationMs)
                .source(LatencyMetric.Source.SPEC_POLL)
                .build();
        latencyRepository.save(metric);
        log.debug("Recorded spec fetch latency {}ms for service {}", durationMs, service.getName());
    }

    @Override
    @Transactional
    public void collectFromActuator(ServiceRegistry service) {
        String url = service.getBaseUrl() + "/actuator/metrics/http.server.requests";
        try {
            String responseBody = restClient.get()
                    .uri(url)
                    .retrieve()
                    .body(String.class);
            callCounter.incActuatorMetrics();

            if (responseBody == null || responseBody.isBlank()) {
                log.warn("Empty actuator response from {}", url);
                return;
            }

            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode measurements = root.path("measurements");

            double count = 0;
            double totalTime = 0;
            double max = 0;

            if (measurements.isArray()) {
                for (JsonNode m : measurements) {
                    String statistic = m.path("statistic").asText("");
                    double value = m.path("value").asDouble(0);
                    switch (statistic) {
                        case "COUNT" -> count = value;
                        case "TOTAL_TIME" -> totalTime = value;
                        case "MAX" -> max = value;
                    }
                }
            }

            Double p50Ms = count > 0 ? (totalTime / count) * 1000.0 : null;
            Double p99Ms = max * 1000.0;
            Long requestCount = (long) count;

            LatencyMetric metric = LatencyMetric.builder()
                    .service(service)
                    .p50Ms(p50Ms)
                    .p99Ms(p99Ms)
                    .requestCount(requestCount)
                    .source(LatencyMetric.Source.ACTUATOR)
                    .build();
            latencyRepository.save(metric);
            log.debug("Collected actuator latency for service {}: p50={}ms p99={}ms count={}", service.getName(), p50Ms, p99Ms, requestCount);

        } catch (Exception e) {
            log.warn("Failed to collect actuator latency from {}: {}", url, e.getMessage());
        }
    }

    @Override
    @Transactional
    @Deprecated
    public void updateLatestWithPrometheusData(ServiceRegistry service, Double p95Ms, Double p50Ms,
                                               String dominantMethod, String dominantPath) {
        // p95Ms/p50Ms are now derived on read from cs_endpoint_performance_snapshots via aggregateServiceLatency().
        // This method is a no-op; preserved to avoid breaking call-sites until a future cleanup.
    }

    @Override
    @Transactional(readOnly = true)
    public List<LatencyMetricDto> getTimeSeries(UUID serviceId, int limitPoints) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));

        List<Object[]> perfRows = performanceSnapshotRepository
                .aggregateServiceLatency(serviceId, PageRequest.of(0, limitPoints));

        if (!perfRows.isEmpty()) {
            // Build a time-indexed map of specFetchMs from latency records for approximate merging.
            List<LatencyMetric> specFetchRecords = latencyRepository
                    .findByServiceOrderByRecordedAtDesc(service, PageRequest.of(0, limitPoints));
            TreeMap<Instant, Long> specFetchByTime = new TreeMap<>();
            for (LatencyMetric m : specFetchRecords) {
                if (m.getSpecFetchMs() != null) {
                    specFetchByTime.put(m.getRecordedAt(), m.getSpecFetchMs());
                }
            }
            return perfRows.stream()
                    .map(row -> {
                        Instant ts = (Instant) row[0];
                        Double p95 = (Double) row[1];
                        Double p50 = (Double) row[2];
                        Double p99 = (Double) row[3];
                        Long count = row[4] != null ? ((Number) row[4]).longValue() : null;
                        return new LatencyMetricDto(null, serviceId, ts,
                                closestSpecFetch(specFetchByTime, ts),
                                p50, p95, p99, count, "SPEC_POLL", null, null);
                    })
                    .collect(Collectors.toList());
        }

        // No performance snapshot data yet — fall back to legacy latency records.
        return latencyRepository.findByServiceOrderByRecordedAtDesc(service, PageRequest.of(0, limitPoints))
                .stream()
                .map(LatencyMetricDto::from)
                .collect(Collectors.toList());
    }

    private static Long closestSpecFetch(TreeMap<Instant, Long> index, Instant target) {
        if (index.isEmpty()) return null;
        Map.Entry<Instant, Long> floor = index.floorEntry(target);
        Map.Entry<Instant, Long> ceil = index.ceilingEntry(target);
        if (floor == null) return ceil.getValue();
        if (ceil == null) return floor.getValue();
        long floorDiff = Math.abs(target.toEpochMilli() - floor.getKey().toEpochMilli());
        long ceilDiff = Math.abs(ceil.getKey().toEpochMilli() - target.toEpochMilli());
        return floorDiff <= ceilDiff ? floor.getValue() : ceil.getValue();
    }
}
