package io.contractsentinel.stats;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * In-process counters tracking every HTTP call Contract Sentinel makes to registered services
 * (outbound) and every Zipkin span batch it receives (inbound).
 * Counts reset on app restart â€” ambient telemetry, not persistent history.
 */
@Component
public class OutboundCallCounter {

    private final int prodBatchSize;

    private final AtomicLong specPolls       = new AtomicLong();
    private final AtomicLong actuatorInfo    = new AtomicLong();
    private final AtomicLong actuatorEnv     = new AtomicLong();
    private final AtomicLong outboundScans   = new AtomicLong();
    private final AtomicLong samplerRuns     = new AtomicLong();
    private final AtomicLong actuatorMetrics = new AtomicLong();

    private final AtomicLong ingestRequests  = new AtomicLong();
    private final AtomicLong ingestSpans     = new AtomicLong();

    public OutboundCallCounter(
            @Value("${sentinel.traces.prod-batch-size:50}") int prodBatchSize) {
        this.prodBatchSize = prodBatchSize;
    }

    public void incSpecPolls()              { specPolls.incrementAndGet(); }
    public void incActuatorInfo()           { actuatorInfo.incrementAndGet(); }
    public void incActuatorEnv()            { actuatorEnv.incrementAndGet(); }
    public void incOutboundScans()          { outboundScans.incrementAndGet(); }
    public void incSamplerRuns()            { samplerRuns.incrementAndGet(); }
    public void incActuatorMetrics()        { actuatorMetrics.incrementAndGet(); }
    public void incIngestRequests()         { ingestRequests.incrementAndGet(); }
    public void incIngestSpans(long count)  { ingestSpans.addAndGet(count); }

    public CallCountDto snapshot() {
        long sp    = specPolls.get();
        long ai    = actuatorInfo.get();
        long ae    = actuatorEnv.get();
        long os    = outboundScans.get();
        long sr    = samplerRuns.get();
        long am    = actuatorMetrics.get();
        long total = sp + ai + ae + os + sr + am;
        long ir    = ingestRequests.get();
        long is_   = ingestSpans.get();
        long pe    = (long) Math.ceil((double) is_ / Math.max(1, prodBatchSize));
        return new CallCountDto(sp, ai, ae, os, sr, am, total, ir, is_, pe);
    }
}
