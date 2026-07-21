package io.contractsentinel.agent;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Micrometer metrics for the autonomous agent layer, exposed at {@code /actuator/prometheus}.
 * Tracks how many agent runs were started, completed, failed, and how long LLM calls take.
 */
@Component
public class AgentMetrics {

    private final Counter runsStarted;
    private final Counter runsCompleted;
    private final Counter runsFailed;
    private final Counter runsCancelled;
    private final Timer llmCallTimer;

    public AgentMetrics(MeterRegistry registry) {
        runsStarted   = registry.counter("sentinel.agent.runs", "outcome", "started");
        runsCompleted = registry.counter("sentinel.agent.runs", "outcome", "completed");
        runsFailed    = registry.counter("sentinel.agent.runs", "outcome", "failed");
        runsCancelled = registry.counter("sentinel.agent.runs", "outcome", "cancelled");
        llmCallTimer  = Timer.builder("sentinel.agent.llm.call.duration")
                .description("Wall-clock time for a single LLM chat() call")
                .publishPercentiles(0.5, 0.95)
                .register(registry);
    }

    public void incStarted()    { runsStarted.increment(); }
    public void incCompleted()  { runsCompleted.increment(); }
    public void incFailed()     { runsFailed.increment(); }
    public void incCancelled()  { runsCancelled.increment(); }

    public void recordLlmCall(long durationMs) {
        llmCallTimer.record(Duration.ofMillis(durationMs));
    }
}
