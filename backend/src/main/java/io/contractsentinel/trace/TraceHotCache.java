package io.contractsentinel.trace;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * In-memory write-ahead cache for recently ingested trace spans.
 * listTraces() reads from this cache instead of the DB for the hot window,
 * making re-fetches triggered by WS trace.received events near-instant.
 *
 * Eviction: time-based (hot window + overlap buffer) via the retention scheduler,
 * plus a secondary span count cap to guard against load-test memory growth.
 */
@Component
public class TraceHotCache {

    private static final int DEDUP_MAX = 1_000;
    private static final int OVERLAP_MINUTES = 5;

    private final int windowMinutes;
    private final int maxSpans;

    private final ConcurrentHashMap<String, ConcurrentLinkedQueue<TraceSpan>> spansByTrace =
            new ConcurrentHashMap<>();
    private final AtomicInteger totalSpans = new AtomicInteger();

    private final Object dedupLock = new Object();
    private final LinkedHashSet<String> recentSpanIds = new LinkedHashSet<>();

    public TraceHotCache(
            @Value("${sentinel.traces.hot-cache-window-minutes:15}") int windowMinutes,
            @Value("${sentinel.traces.hot-cache-max-spans:10000}") int maxSpans) {
        this.windowMinutes = windowMinutes;
        this.maxSpans = maxSpans;
    }

    /**
     * Returns true if this spanId was already seen (duplicate).
     * Side-effect: records the spanId if it is new.
     */
    public boolean isDuplicate(String spanId) {
        synchronized (dedupLock) {
            if (recentSpanIds.contains(spanId)) return true;
            if (recentSpanIds.size() >= DEDUP_MAX) {
                recentSpanIds.remove(recentSpanIds.iterator().next());
            }
            recentSpanIds.add(spanId);
            return false;
        }
    }

    public void put(TraceSpan span) {
        if (totalSpans.get() >= maxSpans) {
            evictOldest();
        }
        spansByTrace.computeIfAbsent(span.getTraceId(), k -> new ConcurrentLinkedQueue<>()).add(span);
        totalSpans.incrementAndGet();
    }

    /**
     * Returns all cached spans whose receivedAt is after the given instant.
     * Called by listTraces() fast-path and overlap-zone merge.
     */
    public List<TraceSpan> getSpansAfter(Instant after) {
        return spansByTrace.values().stream()
                .flatMap(Collection::stream)
                .filter(s -> s.getReceivedAt().isAfter(after))
                .collect(Collectors.toList());
    }

    public int getWindowMinutes()  { return windowMinutes; }
    public int getOverlapMinutes() { return OVERLAP_MINUTES; }

    /** Called by the retention job to remove entries older than the hot window + overlap. */
    public void evictBefore(Instant cutoff) {
        spansByTrace.values().forEach(q -> q.removeIf(s -> s.getReceivedAt().isBefore(cutoff)));
        spansByTrace.entrySet().removeIf(e -> e.getValue().isEmpty());
        totalSpans.set(spansByTrace.values().stream().mapToInt(ConcurrentLinkedQueue::size).sum());
    }

    private void evictOldest() {
        spansByTrace.entrySet().stream()
                .min(Comparator.comparing(e -> {
                    TraceSpan head = e.getValue().peek();
                    return head != null ? head.getReceivedAt() : Instant.MAX;
                }))
                .ifPresent(entry -> {
                    int removed = entry.getValue().size();
                    spansByTrace.remove(entry.getKey());
                    totalSpans.addAndGet(-removed);
                });
    }
}
