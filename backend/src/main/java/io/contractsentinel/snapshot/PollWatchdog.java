package io.contractsentinel.snapshot;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Dead-man watchdog for the poll cycle. If no successful poll completion has been
 * recorded within {@code sentinel.poll.watchdog-max-silence-minutes}, an ERROR is logged.
 * Operators should route these to an alert channel (e.g., via log-based alerting).
 */
@Component
@Slf4j
public class PollWatchdog {

    @Value("${sentinel.poll.watchdog-max-silence-minutes:30}")
    private int maxSilenceMinutes;

    private final AtomicReference<Instant> lastSuccessfulPollAt = new AtomicReference<>();

    /** Called by {@link SpecFetcherScheduler} after every successful {@code pollAll()} cycle. */
    public void recordPollCycleComplete() {
        lastSuccessfulPollAt.set(Instant.now());
    }

    @Scheduled(fixedDelayString = "${sentinel.poll.watchdog-check-interval-ms:300000}",
               initialDelayString = "${sentinel.poll.watchdog-initial-delay-ms:60000}")
    public void check() {
        Instant last = lastSuccessfulPollAt.get();
        if (last == null) {
            log.warn("PollWatchdog: no successful poll cycle recorded since startup");
            return;
        }
        long silenceMinutes = java.time.Duration.between(last, Instant.now()).toMinutes();
        if (silenceMinutes >= maxSilenceMinutes) {
            log.error("PollWatchdog: no successful poll cycle in the last {} minutes " +
                      "(last: {}) — Contract Sentinel may be stuck", silenceMinutes, last);
        }
    }
}
