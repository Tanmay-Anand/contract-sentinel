package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import io.contractsentinel.agent.AgentTool;
import io.contractsentinel.performance.EndpointPerformanceDetail;
import io.contractsentinel.performance.EndpointPerformanceService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.DoubleSummaryStatistics;
import java.util.List;
import java.util.Objects;

/** Reports an endpoint's p50/p95/p99 trend and recent-vs-baseline regression. */
@Component
@RequiredArgsConstructor
public class LatencyTrendTool implements AgentTool {

    private final EndpointPerformanceService performanceService;
    private final ServiceRegistryRepository serviceRegistryRepository;

    @Override
    public String name() {
        return "latency_trend";
    }

    @Override
    public String description() {
        return "Get p50/p95/p99 latency history for an endpoint over N days, plus recent-vs-baseline regression.";
    }

    @Override
    public String parametersJsonSchema() {
        return """
            {"type":"object","properties":{
              "service":{"type":"string","description":"service name"},
              "method":{"type":"string"},
              "path":{"type":"string","description":"templated path, e.g. /bookings/{id}"},
              "days":{"type":"integer","default":7}},
             "required":["service","method","path"]}
            """;
    }

    @Override
    public String execute(JsonNode args) {
        ServiceRegistry service = ToolSupport.resolveService(serviceRegistryRepository, args);
        String method = args.path("method").asText("GET");
        String path = args.path("path").asText("");
        int days = args.path("days").asInt(7);

        EndpointPerformanceDetail detail = performanceService.history(service.getId(), method, path, days);
        List<EndpointPerformanceDetail.Point> pts = detail.points();
        if (pts.isEmpty()) {
            return "No performance history for " + method + " " + path + " on " + service.getName();
        }

        DoubleSummaryStatistics p95 = pts.stream().map(EndpointPerformanceDetail.Point::p95Ms)
                .filter(Objects::nonNull).mapToDouble(Double::doubleValue).summaryStatistics();
        Double latestP95 = pts.get(pts.size() - 1).p95Ms();
        Double latestP99 = pts.get(pts.size() - 1).p99Ms();
        double baselineP95 = p95.getCount() > 0 ? p95.getAverage() : 0;
        double regression = (latestP95 != null && baselineP95 > 0) ? latestP95 / baselineP95 : 1.0;

        return String.format(
                "{\"service\":\"%s\",\"endpoint\":\"%s %s\",\"points\":%d,\"latestP95Ms\":%s,\"latestP99Ms\":%s,"
                + "\"baselineP95Ms\":%.1f,\"p95MinMs\":%.1f,\"p95MaxMs\":%.1f,\"regressionRatio\":%.2f}",
                service.getName(), method, path, pts.size(), latestP95, latestP99,
                baselineP95, p95.getCount() > 0 ? p95.getMin() : 0, p95.getCount() > 0 ? p95.getMax() : 0, regression);
    }
}
