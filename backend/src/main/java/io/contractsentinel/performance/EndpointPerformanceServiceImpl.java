package io.contractsentinel.performance;

import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.sampler.EndpointSizeDto;
import io.contractsentinel.sampler.ResponseSamplerService;
import io.contractsentinel.stats.OutboundCallCounter;
import io.contractsentinel.ws.WebSocketEventPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class EndpointPerformanceServiceImpl implements EndpointPerformanceService {

    private final EndpointPerformanceSnapshotRepository snapshotRepository;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final ResponseSamplerService responseSamplerService;
    private final OutboundCallCounter callCounter;
    private final WebSocketEventPublisher eventPublisher;

    private final RestClient restClient = RestClient.builder()
            .requestFactory(factory())
            .build();

    private static SimpleClientHttpRequestFactory factory() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(5));
        f.setReadTimeout(Duration.ofSeconds(15));
        return f;
    }

    @Override
    @Transactional
    public EndpointPerformanceService.CollectionResult collectForService(ServiceRegistry service) {
        String url = service.getBaseUrl() + contextPathFrom(service.getSpecPath()) + "/actuator/prometheus";
        List<ParsedEndpointMetric> metrics;
        try {
            String body = restClient.get().uri(url).retrieve().body(String.class);
            callCounter.incActuatorMetrics();
            metrics = HttpServerMetricsParser.parse(body);
        } catch (Exception e) {
            log.warn("Failed to scrape prometheus metrics from {}: {}", url, e.getMessage());
            return null;
        }

        if (!metrics.isEmpty() && metrics.stream().allMatch(m -> m.p95Ms() == null)) {
            log.warn("Service '{}' published no percentile metrics — add " +
                     "management.metrics.distribution.percentiles[http.server.requests]=0.5,0.95,0.99 " +
                     "to enable P50/P95/P99 tracking", service.getName());
        }

        for (ParsedEndpointMetric m : metrics) {
            try {
                long previousTotal = snapshotRepository
                        .findTopByServiceAndHttpMethodAndPathOrderByRecordedAtDesc(service, m.method(), m.uri())
                        .map(EndpointPerformanceSnapshot::getTotalCount)
                        .orElse(0L);
                // When count < previousTotal the Prometheus counter reset (service restart).
                // Use the new count as the delta rather than clamping to 0, which would silently
                // discard all requests recorded since the restart.
                long delta = m.count() >= previousTotal ? m.count() - previousTotal : m.count();

                snapshotRepository.save(EndpointPerformanceSnapshot.builder()
                        .service(service)
                        .httpMethod(m.method())
                        .path(m.uri())
                        .p50Ms(m.p50Ms())
                        .p95Ms(m.p95Ms())
                        .p99Ms(m.p99Ms())
                        .meanMs(m.meanMs())
                        .totalCount(m.count())
                        .countDelta(delta)
                        .errorCount(m.errorCount())
                        .build());
            } catch (Exception e) {
                log.warn("Failed to persist performance snapshot for {} {} on {}: {}",
                        m.method(), m.uri(), service.getName(), e.getMessage());
            }
        }
        log.debug("Collected {} endpoint performance snapshots for {}", metrics.size(), service.getName());
        if (!metrics.isEmpty()) {
            eventPublisher.publish("metric.updated", Map.of("serviceName", service.getName()));
        }

        // Find the endpoint with the highest P95 at this scrape cycle.
        ParsedEndpointMetric dominant = metrics.stream()
                .filter(m -> m.p95Ms() != null)
                .max(Comparator.comparingDouble(ParsedEndpointMetric::p95Ms))
                .orElse(null);

        if (dominant == null) return null;

        OptionalDouble avgP50 = metrics.stream()
                .filter(m -> m.p50Ms() != null)
                .mapToDouble(ParsedEndpointMetric::p50Ms)
                .average();
        Double serviceMaxP50 = avgP50.isPresent() ? avgP50.getAsDouble() : null;

        return new EndpointPerformanceService.CollectionResult(
                dominant.p95Ms(), serviceMaxP50, dominant.method(), dominant.uri());
    }

    @Override
    @Transactional(readOnly = true)
    public List<EndpointPerformanceRow> registry(UUID serviceId, String method, String query) {
        List<EndpointPerformanceSnapshot> latest = snapshotRepository.findLatestPerEndpoint();

        // 7-day series per endpoint, reused for both sparklines and volatility.
        Instant weekAgo = Instant.now().minus(Duration.ofDays(7));
        Map<String, List<Double>> p95Series = snapshotRepository.findByRecordedAtAfterOrderByRecordedAt(weekAgo)
                .stream()
                .collect(Collectors.groupingBy(
                        EndpointPerformanceServiceImpl::endpointKey,
                        LinkedHashMap::new,
                        Collectors.mapping(EndpointPerformanceSnapshot::getP95Ms, Collectors.toList())));

        Map<String, Long> sizeByKey = responseSamplerService.getEndpointSizes().stream()
                .collect(Collectors.toMap(
                        s -> sizeKey(s),
                        EndpointSizeDto::responseSizeBytes,
                        (a, b) -> a));

        // Median of latest p99 across all endpoints, for the relative ranking badge.
        double medianP99 = medianOfP99(latest);

        List<EndpointPerformanceRow> rows = new ArrayList<>();
        for (EndpointPerformanceSnapshot s : latest) {
            if (serviceId != null && !s.getService().getId().equals(serviceId)) continue;
            if (method != null && !method.isBlank() && !method.equalsIgnoreCase(s.getHttpMethod())) continue;
            if (query != null && !query.isBlank()
                    && !s.getPath().toLowerCase().contains(query.toLowerCase())) continue;

            String key = endpointKey(s);
            List<Double> series = p95Series.getOrDefault(key, List.of());
            VolatilityCalculator.Result vol = VolatilityCalculator.compute(series);

            double errorRatePct = s.getTotalCount() > 0
                    ? (s.getErrorCount() * 100.0) / s.getTotalCount()
                    : 0.0;
            double p99Ratio = (medianP99 > 0 && s.getP99Ms() != null) ? s.getP99Ms() / medianP99 : 0.0;

            rows.add(new EndpointPerformanceRow(
                    s.getService().getId(),
                    s.getService().getName(),
                    s.getHttpMethod(),
                    s.getPath(),
                    s.getCountDelta(),
                    s.getP50Ms(),
                    s.getP95Ms(),
                    s.getP99Ms(),
                    s.getMeanMs(),
                    round(errorRatePct),
                    sizeByKey.get(s.getService().getId() + ":" + s.getHttpMethod() + ":" + s.getPath()),
                    round(p99Ratio),
                    series.stream().filter(Objects::nonNull).collect(Collectors.toList()),
                    vol.cv() != null ? round(vol.cv()) : null,
                    vol.rating()));
        }
        rows.sort(Comparator.comparingDouble((EndpointPerformanceRow r) ->
                r.p99Ms() != null ? r.p99Ms() : 0.0).reversed());
        return rows;
    }

    @Override
    @Transactional(readOnly = true)
    public EndpointPerformanceDetail history(UUID serviceId, String method, String path, int days) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));
        Instant after = Instant.now().minus(Duration.ofDays(Math.max(1, days)));
        List<EndpointPerformanceDetail.Point> points = snapshotRepository
                .findByServiceAndHttpMethodAndPathAndRecordedAtAfterOrderByRecordedAt(service, method, path, after)
                .stream()
                .map(EndpointPerformanceDetail.Point::from)
                .collect(Collectors.toList());
        return new EndpointPerformanceDetail(service.getId(), service.getName(), method, path, points);
    }

    @Override
    @Transactional
    public void purgeOlderThan(int retentionDays) {
        snapshotRepository.deleteByRecordedAtBefore(Instant.now().minus(Duration.ofDays(Math.max(1, retentionDays))));
    }

    private static double medianOfP99(List<EndpointPerformanceSnapshot> latest) {
        List<Double> p99s = latest.stream()
                .map(EndpointPerformanceSnapshot::getP99Ms)
                .filter(Objects::nonNull)
                .sorted()
                .toList();
        if (p99s.isEmpty()) return 0.0;
        int mid = p99s.size() / 2;
        return p99s.size() % 2 == 1 ? p99s.get(mid) : (p99s.get(mid - 1) + p99s.get(mid)) / 2.0;
    }

    private static String endpointKey(EndpointPerformanceSnapshot s) {
        return s.getService().getId() + ":" + s.getHttpMethod() + ":" + s.getPath();
    }

    private static String sizeKey(EndpointSizeDto s) {
        return s.serviceId() + ":" + s.httpMethod() + ":" + s.path();
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static String contextPathFrom(String specPath) {
        if (specPath == null) return "";
        int idx = specPath.lastIndexOf("/v3/api-docs");
        if (idx <= 0) return "";
        return specPath.substring(0, idx);
    }
}
