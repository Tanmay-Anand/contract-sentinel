package io.contractsentinel.trace;

import tools.jackson.databind.ObjectMapper;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.stats.OutboundCallCounter;
import io.contractsentinel.ws.WebSocketEventPublisher;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
public class TraceServiceImpl implements TraceService {

    private final TraceSpanRepository spanRepository;
    private final WebSocketEventPublisher eventPublisher;
    private final TraceHotCache hotCache;
    private final OutboundCallCounter counter;
    private final List<String> noisePathPrefixes;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TraceServiceImpl(TraceSpanRepository spanRepository,
                            WebSocketEventPublisher eventPublisher,
                            TraceHotCache hotCache,
                            OutboundCallCounter counter,
                            @Value("${sentinel.traces.noise-path-prefixes:}") List<String> noisePathPrefixes) {
        this.spanRepository = spanRepository;
        this.eventPublisher = eventPublisher;
        this.hotCache = hotCache;
        this.counter = counter;
        this.noisePathPrefixes = noisePathPrefixes != null ? noisePathPrefixes : List.of();
    }

    @Override
    @Transactional
    public void ingest(List<ZipkinSpanDto> spans) {
        if (spans == null || spans.isEmpty()) {
            return;
        }

        counter.incIngestRequests();

        // Pass 1: collect traceIds where any span belongs to a noise path (actuator, api-docs, etc.)
        Set<String> noiseTraceIds = Collections.emptySet();
        if (!noisePathPrefixes.isEmpty()) {
            for (ZipkinSpanDto s : spans) {
                Map<String, String> tags = s.tags() != null ? s.tags() : Map.of();
                String path = firstTag(tags, "http.path", "http.route", "uri");
                if (path != null && isNoisePath(path)) {
                    if (noiseTraceIds.isEmpty()) noiseTraceIds = new HashSet<>();
                    noiseTraceIds.add(s.traceId());
                }
            }
        }
        final Set<String> noiseSet = noiseTraceIds;

        // Pass 2: build entities, skipping all spans belonging to noise traces
        List<TraceSpan> entities = new ArrayList<>(spans.size());
        for (ZipkinSpanDto s : spans) {
            if (s.traceId() == null || s.id() == null) continue;
            if (!noiseSet.isEmpty() && noiseSet.contains(s.traceId())) continue;
            if (hotCache.isDuplicate(s.id())) continue;

            Map<String, String> tags = s.tags() != null ? s.tags() : Map.of();
            entities.add(TraceSpan.builder()
                    .traceId(s.traceId())
                    .spanId(s.id())
                    .parentSpanId(s.parentId())
                    .serviceName(s.localEndpoint() != null && s.localEndpoint().serviceName() != null
                            ? s.localEndpoint().serviceName() : "unknown")
                    .spanName(s.name())
                    .kind(s.kind())
                    .startEpochMicros(s.timestamp() != null ? s.timestamp() : 0L)
                    .durationMicros(s.duration() != null ? s.duration() : 0L)
                    .httpMethod(firstTag(tags, "http.method", "method"))
                    .httpPath(firstTag(tags, "http.path", "http.route", "uri"))
                    .httpStatus(parseStatus(firstTag(tags, "http.status_code", "status")))
                    .tagsJson(writeTags(tags))
                    .build());
        }

        if (entities.isEmpty()) return;

        spanRepository.saveAll(entities);
        entities.forEach(hotCache::put);
        counter.incIngestSpans(entities.size());

        Set<String> traceIds = entities.stream().map(TraceSpan::getTraceId).collect(Collectors.toSet());
        log.info("Zipkin ingest: {} span(s) across {} trace(s)", entities.size(), traceIds.size());
        eventPublisher.publish("trace.received", Map.of("count", traceIds.size(), "traceIds", traceIds));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TraceSummaryDto> listTraces(String serviceName, Long minDurationMs, int sinceMinutes, int limit) {
        Instant after = Instant.now().minus(Duration.ofMinutes(Math.max(1, sinceMinutes)));

        int hotWindow    = hotCache.getWindowMinutes();
        int overlapLimit = hotWindow + hotCache.getOverlapMinutes();

        List<TraceSpan> spans;
        if (sinceMinutes <= hotWindow) {
            spans = hotCache.getSpansAfter(after);
        } else if (sinceMinutes <= overlapLimit) {
            List<TraceSpan> fromCache = hotCache.getSpansAfter(after);
            Set<String> cacheIds = fromCache.stream().map(TraceSpan::getSpanId).collect(Collectors.toSet());
            List<TraceSpan> fromDb = spanRepository.findByReceivedAtAfter(after, PageRequest.of(0, 5000));
            List<TraceSpan> merged = new ArrayList<>(fromCache.size() + fromDb.size());
            merged.addAll(fromCache);
            fromDb.stream().filter(s -> !cacheIds.contains(s.getSpanId())).forEach(merged::add);
            spans = merged;
        } else {
            spans = spanRepository.findByReceivedAtAfter(after, PageRequest.of(0, 5000));
        }

        Map<String, List<TraceSpan>> byTrace = spans.stream()
                .collect(Collectors.groupingBy(TraceSpan::getTraceId));

        List<TraceSummaryDto> summaries = new ArrayList<>();
        for (Map.Entry<String, List<TraceSpan>> entry : byTrace.entrySet()) {
            List<TraceSpan> group = entry.getValue();
            Set<String> spanIds = group.stream().map(TraceSpan::getSpanId).collect(Collectors.toSet());

            TraceSpan root = group.stream()
                    .filter(s -> s.getParentSpanId() == null || !spanIds.contains(s.getParentSpanId()))
                    .min(Comparator.comparingLong(TraceSpan::getStartEpochMicros))
                    .orElse(group.get(0));

            long start = group.stream().mapToLong(TraceSpan::getStartEpochMicros).min().orElse(0);
            long end   = group.stream().mapToLong(s -> s.getStartEpochMicros() + s.getDurationMicros()).max().orElse(start);
            long total = Math.max(0, end - start);
            boolean hasError = group.stream().anyMatch(s -> s.getHttpStatus() != null && s.getHttpStatus() >= 400);

            // Only surface traces whose root is a real HTTP call; skip background jobs,
            // security filter spans, and other non-HTTP instrumentation noise.
            if (root.getHttpMethod() == null || root.getHttpPath() == null) continue;

            if (serviceName != null && !serviceName.isBlank()
                    && group.stream().noneMatch(s -> serviceName.equalsIgnoreCase(s.getServiceName()))) {
                continue;
            }
            if (minDurationMs != null && total / 1000.0 < minDurationMs) {
                continue;
            }

            String rootName = root.getHttpMethod().toUpperCase() + " " + root.getHttpPath();
            summaries.add(new TraceSummaryDto(
                    entry.getKey(), rootName, root.getServiceName(),
                    total, group.size(), hasError, start));
        }

        summaries.sort(Comparator.comparingLong(TraceSummaryDto::startEpochMicros).reversed());
        return summaries.stream().limit(Math.max(1, limit)).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public TraceTreeDto getTrace(String traceId) {
        List<TraceSpan> spans = spanRepository.findByTraceIdOrderByStartEpochMicros(traceId);
        if (spans.isEmpty()) {
            throw SentinelException.notFound("Trace not found: " + traceId, RequestContext.getRequestId());
        }

        Set<String> spanIds = spans.stream().map(TraceSpan::getSpanId).collect(Collectors.toSet());
        Map<String, List<TraceSpan>> childrenByParent = new HashMap<>();
        List<TraceSpan> roots = new ArrayList<>();
        for (TraceSpan s : spans) {
            if (s.getParentSpanId() == null || !spanIds.contains(s.getParentSpanId())) {
                roots.add(s);
            } else {
                childrenByParent.computeIfAbsent(s.getParentSpanId(), k -> new ArrayList<>()).add(s);
            }
        }
        roots.sort(Comparator.comparingLong(TraceSpan::getStartEpochMicros));

        long traceStart = spans.stream().mapToLong(TraceSpan::getStartEpochMicros).min().orElse(0);
        long traceEnd   = spans.stream().mapToLong(s -> s.getStartEpochMicros() + s.getDurationMicros()).max().orElse(traceStart);

        List<TraceTreeDto.SpanNode> ordered = new ArrayList<>();
        for (TraceSpan root : roots) {
            appendDepthFirst(root, 0, traceStart, childrenByParent, ordered);
        }

        TraceSpan root = roots.get(0);
        return new TraceTreeDto(traceId, root.getSpanName(), Math.max(0, traceEnd - traceStart), traceStart, ordered);
    }

    @Override
    @Transactional
    public void purgeOlderThan(int retentionHours) {
        Instant cutoff = Instant.now().minus(Duration.ofHours(Math.max(1, retentionHours)));
        spanRepository.deleteByReceivedAtBefore(cutoff);
        hotCache.evictBefore(cutoff);
    }

    private void appendDepthFirst(TraceSpan span, int depth, long traceStart,
                                  Map<String, List<TraceSpan>> childrenByParent,
                                  List<TraceTreeDto.SpanNode> out) {
        out.add(new TraceTreeDto.SpanNode(
                span.getSpanId(), span.getParentSpanId(), span.getServiceName(), span.getSpanName(),
                span.getKind(), depth, Math.max(0, span.getStartEpochMicros() - traceStart),
                span.getDurationMicros(), span.getHttpMethod(), span.getHttpPath(), span.getHttpStatus()));

        List<TraceSpan> children = childrenByParent.get(span.getSpanId());
        if (children != null) {
            children.sort(Comparator.comparingLong(TraceSpan::getStartEpochMicros));
            for (TraceSpan child : children) {
                appendDepthFirst(child, depth + 1, traceStart, childrenByParent, out);
            }
        }
    }

    private boolean isNoisePath(String path) {
        for (String prefix : noisePathPrefixes) {
            if (path.startsWith(prefix)) return true;
        }
        return false;
    }

    private static String firstTag(Map<String, String> tags, String... keys) {
        for (String key : keys) {
            String v = tags.get(key);
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }

    private static Integer parseStatus(String status) {
        if (status == null) return null;
        try {
            return Integer.parseInt(status.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String writeTags(Map<String, String> tags) {
        try {
            return objectMapper.writeValueAsString(tags);
        } catch (Exception e) {
            return "{}";
        }
    }
}
