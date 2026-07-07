package io.contractsentinel.graph;

import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.stats.OutboundCallCounter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Derives average inter-service round-trip latency by scraping each service's
 * {@code http_client_requests_seconds} metric and mapping each outbound call's URI to a target
 * service by context-path prefix (localhost calls all share {@code client.name=localhost}, so the
 * URI prefix is the only reliable discriminator). Results are cached briefly so the graph endpoint
 * stays cheap under UI polling.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OutboundLatencyCollector {

    private static final String CLIENT_FAMILY = "http_client_requests_seconds";
    private static final Pattern LABEL = Pattern.compile("(\\w+)=\"([^\"]*)\"");
    private static final long CACHE_TTL_MS = 60_000;

    private final ServiceRegistryRepository serviceRegistryRepository;
    private final OutboundCallCounter callCounter;

    private final RestClient restClient = RestClient.builder()
            .requestFactory(factory())
            .build();

    private volatile Map<String, Double> cache = Map.of();
    private volatile long cachedAt = 0;

    private static SimpleClientHttpRequestFactory factory() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(3));
        f.setReadTimeout(Duration.ofSeconds(8));
        return f;
    }

    /** @return average round-trip millis for {@code sourceId->targetId}, or {@code null} if unknown. */
    public Double latencyFor(UUID sourceId, UUID targetId) {
        return snapshot().get(sourceId + "->" + targetId);
    }

    public static String bandFor(Double ms) {
        if (ms == null) return null;
        if (ms < 10) return "fast";
        if (ms <= 50) return "medium";
        return "slow";
    }

    private synchronized Map<String, Double> snapshot() {
        long now = System.currentTimeMillis();
        if (now - cachedAt < CACHE_TTL_MS && !cache.isEmpty()) {
            return cache;
        }
        Map<String, Double> refreshed = compute();
        if (!refreshed.isEmpty()) {
            cache = refreshed;
            cachedAt = now;
        }
        return refreshed;
    }

    private Map<String, Double> compute() {
        List<ServiceRegistry> services = serviceRegistryRepository.findAllByActiveTrue();
        Map<String, Double> result = new HashMap<>();

        for (ServiceRegistry source : services) {
            String url = source.getBaseUrl() + contextPathFrom(source.getSpecPath()) + "/actuator/prometheus";
            String body;
            try {
                body = restClient.get().uri(url).retrieve().body(String.class);
                callCounter.incActuatorMetrics();
            } catch (Exception e) {
                log.debug("No client metrics from {}: {}", url, e.getMessage());
                continue;
            }
            if (body == null || body.isBlank()) {
                continue;
            }

            // Aggregate count/sum per outbound uri, then attribute to a target by context-path prefix.
            Map<UUID, double[]> perTarget = new HashMap<>();
            for (String line : body.split("\\R")) {
                if (line.isEmpty() || line.charAt(0) == '#') continue;
                boolean isCount = line.startsWith(CLIENT_FAMILY + "_count{");
                boolean isSum = line.startsWith(CLIENT_FAMILY + "_sum{");
                if (!isCount && !isSum) continue;

                int brace = line.indexOf('{');
                int close = line.lastIndexOf('}');
                if (brace < 0 || close < brace) continue;
                Map<String, String> labels = parseLabels(line.substring(brace + 1, close));
                String uri = labels.get("uri");
                if (uri == null || uri.isBlank()) continue;
                double value = parseValue(line.substring(close + 1));
                if (Double.isNaN(value)) continue;

                UUID targetId = resolveTarget(uri, services, source.getId());
                if (targetId == null) continue;
                double[] agg = perTarget.computeIfAbsent(targetId, k -> new double[2]);
                if (isCount) agg[0] += value; else agg[1] += value;
            }

            for (Map.Entry<UUID, double[]> e : perTarget.entrySet()) {
                double count = e.getValue()[0];
                double sumSeconds = e.getValue()[1];
                if (count > 0) {
                    double avgMs = (sumSeconds / count) * 1000.0;
                    result.put(source.getId() + "->" + e.getKey(), Math.round(avgMs * 100.0) / 100.0);
                }
            }
        }
        return result;
    }

    private UUID resolveTarget(String uri, List<ServiceRegistry> services, UUID sourceId) {
        for (ServiceRegistry svc : services) {
            if (svc.getId().equals(sourceId)) continue;
            String ctx = contextPathFrom(svc.getSpecPath());
            if (!ctx.isEmpty() && uri.startsWith(ctx)) {
                return svc.getId();
            }
        }
        return null;
    }

    private static Map<String, String> parseLabels(String block) {
        Map<String, String> labels = new LinkedHashMap<>();
        Matcher m = LABEL.matcher(block);
        while (m.find()) labels.put(m.group(1), m.group(2));
        return labels;
    }

    private static double parseValue(String rest) {
        String t = rest.trim();
        if (t.isEmpty()) return Double.NaN;
        int space = t.indexOf(' ');
        try {
            return Double.parseDouble(space > 0 ? t.substring(0, space) : t);
        } catch (NumberFormatException e) {
            return Double.NaN;
        }
    }

    private static String contextPathFrom(String specPath) {
        if (specPath == null) return "";
        int idx = specPath.lastIndexOf("/v3/api-docs");
        if (idx <= 0) return "";
        return specPath.substring(0, idx);
    }
}
