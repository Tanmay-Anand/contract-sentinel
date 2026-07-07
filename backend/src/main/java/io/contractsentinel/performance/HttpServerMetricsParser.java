package io.contractsentinel.performance;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses the {@code http_server_requests_seconds} metric family out of a Prometheus scrape
 * ({@code /actuator/prometheus}) and aggregates it per (method, uri).
 *
 * <p>Prometheus is the only actuator surface that exposes pre-computed percentiles (as
 * {@code quantile}-labelled samples); the plain JSON {@code /metrics} endpoint only carries
 * count/total/max. Multiple label combinations (status, outcome, exception) exist per endpoint;
 * counts and sums are summed, max is maxed, and each quantile is taken as the worst value across
 * combinations â€” a deliberate, locally-valid approximation.
 */
public final class HttpServerMetricsParser {

    private static final String FAMILY = "http_server_requests_seconds";
    private static final Pattern LABEL = Pattern.compile("(\\w+)=\"([^\"]*)\"");

    private HttpServerMetricsParser() {}

    public static List<ParsedEndpointMetric> parse(String prometheusBody) {
        if (prometheusBody == null || prometheusBody.isBlank()) {
            return List.of();
        }

        Map<String, Acc> byEndpoint = new LinkedHashMap<>();

        for (String line : prometheusBody.split("\\R")) {
            if (line.isEmpty() || line.charAt(0) == '#') {
                continue;
            }
            int brace = line.indexOf('{');
            if (brace < 0) {
                continue;
            }
            String name = line.substring(0, brace).trim();
            boolean isCount = name.equals(FAMILY + "_count");
            boolean isSum = name.equals(FAMILY + "_sum");
            boolean isMax = name.equals(FAMILY + "_max");
            boolean isQuantile = name.equals(FAMILY);
            if (!isCount && !isSum && !isMax && !isQuantile) {
                continue;
            }

            int close = line.lastIndexOf('}');
            if (close < brace) {
                continue;
            }
            String labelBlock = line.substring(brace + 1, close);
            double value = parseValue(line.substring(close + 1));
            if (Double.isNaN(value) || Double.isInfinite(value)) {
                continue;
            }

            Map<String, String> labels = parseLabels(labelBlock);
            String uri = labels.get("uri");
            String method = labels.getOrDefault("method", "GET");
            if (uri == null || uri.isBlank() || !isRelevantUri(uri)) {
                continue;
            }

            Acc acc = byEndpoint.computeIfAbsent(method + " " + uri, k -> new Acc(method, uri));
            if (isCount) {
                long c = (long) value;
                acc.count += c;
                String outcome = labels.getOrDefault("outcome", "");
                if ("CLIENT_ERROR".equals(outcome) || "SERVER_ERROR".equals(outcome)) {
                    acc.errorCount += c;
                }
            } else if (isSum) {
                acc.sumSeconds += value;
            } else if (isMax) {
                acc.maxSeconds = Math.max(acc.maxSeconds, value);
            } else { // quantile
                String phi = labels.get("quantile");
                if (phi != null) {
                    acc.quantiles.merge(phi, value, Math::max);
                }
            }
        }

        List<ParsedEndpointMetric> result = new ArrayList<>(byEndpoint.size());
        for (Acc a : byEndpoint.values()) {
            result.add(a.toMetric());
        }
        return result;
    }

    private static boolean isRelevantUri(String uri) {
        if (uri.equals("UNKNOWN") || uri.equals("None") || uri.equals("/**")) {
            return false;
        }
        return !uri.startsWith("/actuator");
    }

    private static Map<String, String> parseLabels(String labelBlock) {
        Map<String, String> labels = new LinkedHashMap<>();
        Matcher m = LABEL.matcher(labelBlock);
        while (m.find()) {
            labels.put(m.group(1), m.group(2));
        }
        return labels;
    }

    private static double parseValue(String rest) {
        String trimmed = rest.trim();
        if (trimmed.isEmpty()) {
            return Double.NaN;
        }
        int space = trimmed.indexOf(' ');
        String token = space > 0 ? trimmed.substring(0, space) : trimmed;
        try {
            return Double.parseDouble(token);
        } catch (NumberFormatException e) {
            return Double.NaN;
        }
    }

    private static final class Acc {
        final String method;
        final String uri;
        long count;
        long errorCount;
        double sumSeconds;
        double maxSeconds;
        final Map<String, Double> quantiles = new LinkedHashMap<>();

        Acc(String method, String uri) {
            this.method = method;
            this.uri = uri;
        }

        ParsedEndpointMetric toMetric() {
            Double p50 = quantiles.containsKey("0.5")
                    ? quantiles.get("0.5") * 1000.0
                    : (count > 0 ? (sumSeconds / count) * 1000.0 : null);
            Double p95 = quantiles.containsKey("0.95") ? quantiles.get("0.95") * 1000.0 : null;
            Double p99 = quantiles.containsKey("0.99")
                    ? quantiles.get("0.99") * 1000.0
                    : maxSeconds * 1000.0;
            return new ParsedEndpointMetric(method, uri, count, errorCount, p50, p95, p99);
        }
    }
}
