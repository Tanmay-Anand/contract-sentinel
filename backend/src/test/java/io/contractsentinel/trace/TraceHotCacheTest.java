package io.contractsentinel.trace;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class TraceHotCacheTest {

    private final TraceHotCache cache = new TraceHotCache(15, 10_000);

    @Test
    void coversWindow_returnsFalseForTimestampsBeforeWarmSince() {
        // Any instant before the cache was constructed is outside the warm window.
        Instant beforeBoot = Instant.now().minusSeconds(60);
        assertThat(cache.coversWindow(beforeBoot)).isFalse();
    }

    @Test
    void coversWindow_returnsTrueForTimestampsAfterConstruction() {
        // Timestamps at or after the construction instant are covered.
        Instant afterBoot = Instant.now().plusSeconds(1);
        assertThat(cache.coversWindow(afterBoot)).isTrue();
    }

    @Test
    void isDuplicate_firstSeenReturnsFalse() {
        assertThat(cache.isDuplicate("span-abc")).isFalse();
    }

    @Test
    void isDuplicate_secondSeenReturnsTrue() {
        cache.isDuplicate("span-xyz");
        assertThat(cache.isDuplicate("span-xyz")).isTrue();
    }

    @Test
    void isDuplicate_differentIdsAreIndependent() {
        cache.isDuplicate("span-1");
        assertThat(cache.isDuplicate("span-2")).isFalse();
    }

    @Test
    void isDuplicate_fifoEvictionDropsOldestWhenCapExceeded() {
        // Fill to capacity (DEDUP_MAX = 1000 in production, but cache is constructed with defaults).
        // White-box: we know DEDUP_MAX is 1_000 from the source. Insert 1001 distinct IDs.
        for (int i = 0; i < 1001; i++) {
            cache.isDuplicate("span-fifo-" + i);
        }
        // "span-fifo-0" should have been evicted (FIFO); seeing it now returns false (not duplicate).
        assertThat(cache.isDuplicate("span-fifo-0")).isFalse();
    }

    @Test
    void getSpansAfter_returnsOnlySpansNewerThanCutoff() {
        Instant cutoff = Instant.now();
        TraceSpan old = TraceSpan.builder()
                .traceId("t1").spanId("s1").serviceName("svc")
                .startEpochMicros(0).durationMicros(0)
                .receivedAt(cutoff.minusSeconds(10))
                .build();
        TraceSpan recent = TraceSpan.builder()
                .traceId("t2").spanId("s2").serviceName("svc")
                .startEpochMicros(0).durationMicros(0)
                .receivedAt(cutoff.plusSeconds(1))
                .build();
        cache.put(old);
        cache.put(recent);

        assertThat(cache.getSpansAfter(cutoff)).containsExactly(recent);
    }

    @Test
    void evictBefore_removesStaleSpans() {
        Instant now = Instant.now();
        TraceSpan stale = TraceSpan.builder()
                .traceId("t1").spanId("s1").serviceName("svc")
                .startEpochMicros(0).durationMicros(0)
                .receivedAt(now.minusSeconds(120))
                .build();
        cache.put(stale);
        cache.evictBefore(now.minusSeconds(60));

        assertThat(cache.getSpansAfter(Instant.EPOCH)).isEmpty();
    }
}
