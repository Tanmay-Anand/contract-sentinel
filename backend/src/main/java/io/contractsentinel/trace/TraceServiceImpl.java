package io.contractsentinel.trace;

import tools.jackson.databind.ObjectMapper;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.ws.WebSocketEventPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class TraceServiceImpl implements TraceService {

    private final TraceSpanRepository spanRepository;
    private final WebSocketEventPublisher eventPublisher;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    @Transactional
    public void ingest(List<ZipkinSpanDto> spans) {
        if (spans == null || spans.isEmpty()) {
            return;
        }
        List<TraceSpan> entities = new ArrayList<>(spans.size());
        for (ZipkinSpanDto s : spans) {
            if (s.traceId() == null || s.id() == null) {
                continue;
            }
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
        spanRepository.saveAll(entities);

        Set<String> traceIds = entities.stream().map(TraceSpan::getTraceId).collect(Collectors.toSet());
        log.debug("Received {} Zipkin span(s) across {} trace(s)", entities.size(), traceIds.size());
        eventPublisher.publish("trace.received", Map.of("count", traceIds.size(), "traceIds", traceIds));
    }

    @Override
    @Transactional(readOnly = true)
    public List<TraceSummaryDto> listTraces(String serviceName, Long minDurationMs, int sinceMinutes, int limit) {
        Instant after = Instant.now().minus(Duration.ofMinutes(Math.max(1, sinceMinutes)));
        List<TraceSpan> spans = spanRepository.findByReceivedAtAfter(after, PageRequest.of(0, 5000));

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
            long end = group.stream().mapToLong(s -> s.getStartEpochMicros() + s.getDurationMicros()).max().orElse(start);
            long total = Math.max(0, end - start);
            boolean hasError = group.stream().anyMatch(s -> s.getHttpStatus() != null && s.getHttpStatus() >= 400);

            if (serviceName != null && !serviceName.isBlank()
                    && group.stream().noneMatch(s -> serviceName.equalsIgnoreCase(s.getServiceName()))) {
                continue;
            }
            if (minDurationMs != null && total / 1000.0 < minDurationMs) {
                continue;
            }

            String rootName = (root.getHttpMethod() != null && root.getHttpPath() != null)
                    ? root.getHttpMethod().toUpperCase() + " " + root.getHttpPath()
                    : root.getSpanName();
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
        long traceEnd = spans.stream().mapToLong(s -> s.getStartEpochMicros() + s.getDurationMicros()).max().orElse(traceStart);

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
        spanRepository.deleteByReceivedAtBefore(Instant.now().minus(Duration.ofHours(Math.max(1, retentionHours))));
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
