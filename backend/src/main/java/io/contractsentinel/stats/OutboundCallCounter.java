package io.contractsentinel.stats;

import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

/**
 * In-process counter tracking every HTTP call ContractSentinel makes to registered services.
 * Incremented by the callers; read by StatsController to power the navbar badge.
 * Counts reset on app restart (intentional — this is ambient telemetry, not persistent history).
 */
@Component
public class OutboundCallCounter {

    private final AtomicLong specPolls        = new AtomicLong();
    private final AtomicLong actuatorInfo     = new AtomicLong();
    private final AtomicLong actuatorEnv      = new AtomicLong();
    private final AtomicLong outboundScans    = new AtomicLong();
    private final AtomicLong samplerRuns      = new AtomicLong();
    private final AtomicLong actuatorMetrics  = new AtomicLong();

    public void incSpecPolls()       { specPolls.incrementAndGet(); }
    public void incActuatorInfo()    { actuatorInfo.incrementAndGet(); }
    public void incActuatorEnv()     { actuatorEnv.incrementAndGet(); }
    public void incOutboundScans()   { outboundScans.incrementAndGet(); }
    public void incSamplerRuns()     { samplerRuns.incrementAndGet(); }
    public void incActuatorMetrics() { actuatorMetrics.incrementAndGet(); }

    public CallCountDto snapshot() {
        long sp  = specPolls.get();
        long ai  = actuatorInfo.get();
        long ae  = actuatorEnv.get();
        long os  = outboundScans.get();
        long sr  = samplerRuns.get();
        long am  = actuatorMetrics.get();
        long total = sp + ai + ae + os + sr + am;
        return new CallCountDto(sp, ai, ae, os, sr, am, total);
    }
}
