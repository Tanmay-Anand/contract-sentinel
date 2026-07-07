package io.contractsentinel.profiling;

import io.contractsentinel.registry.ServiceRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Short, self-contained transactional DB operations for a profiling run. Kept separate from
 * {@link ProfilingWorker} so each step commits independently â€” the worker's long polling loop
 * never holds a database transaction (or connection) open.
 */
@Component
@RequiredArgsConstructor
public class ProfilingStore {

    private final ProfilingRunRepository runRepository;
    private final HotMethodRepository hotMethodRepository;

    /** Immutable snapshot of what the worker needs, resolved inside a transaction (avoids lazy-init). */
    public record Target(UUID runId, String actuatorBaseUrl, String serviceName, int durationSeconds) {}

    @Transactional(readOnly = true)
    public Target loadTarget(UUID runId) {
        ProfilingRun run = runRepository.findById(runId)
                .orElseThrow(() -> new NoSuchElementException("Profiling run not found: " + runId));
        ServiceRegistry svc = run.getService();
        String base = svc.getBaseUrl() + contextPathFrom(svc.getSpecPath()) + "/actuator/jfr";
        return new Target(runId, base, svc.getName(), run.getDurationSeconds());
    }

    @Transactional
    public void status(UUID runId, ProfilingRun.Status status) {
        runRepository.findById(runId).ifPresent(run -> {
            run.setStatus(status);
            runRepository.save(run);
        });
    }

    @Transactional
    public void fail(UUID runId, String message) {
        runRepository.findById(runId).ifPresent(run -> {
            run.setStatus(ProfilingRun.Status.FAILED);
            run.setErrorMessage(truncate(message, 500));
            run.setCompletedAt(Instant.now());
            runRepository.save(run);
        });
    }

    @Transactional
    public void complete(UUID runId, long totalSamples, List<JfrParser.FrameCount> frames) {
        ProfilingRun run = runRepository.findById(runId)
                .orElseThrow(() -> new NoSuchElementException("Profiling run not found: " + runId));
        int rank = 1;
        for (JfrParser.FrameCount fc : frames) {
            double pct = totalSamples > 0 ? (fc.samples() * 100.0) / totalSamples : 0.0;
            hotMethodRepository.save(HotMethod.builder()
                    .runId(runId)
                    .rank(rank++)
                    .frame(truncate(fc.frame(), 500))
                    .sampleCount(fc.samples())
                    .percentage(Math.round(pct * 100.0) / 100.0)
                    .build());
        }
        run.setStatus(ProfilingRun.Status.COMPLETE);
        run.setTotalSamples(totalSamples);
        run.setCompletedAt(Instant.now());
        runRepository.save(run);
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String contextPathFrom(String specPath) {
        if (specPath == null) return "";
        int idx = specPath.lastIndexOf("/v3/api-docs");
        if (idx <= 0) return "";
        return specPath.substring(0, idx);
    }
}
