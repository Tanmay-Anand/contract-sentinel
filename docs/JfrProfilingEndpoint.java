// Copy this class into any Spring Boot service you want to profile, then set your own package.
package com.yourcompany.actuator;

import jdk.jfr.Recording;
import jdk.jfr.RecordingState;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.actuate.endpoint.annotation.Endpoint;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import org.springframework.boot.actuate.endpoint.annotation.Selector;
import org.springframework.boot.actuate.endpoint.annotation.WriteOperation;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Custom actuator endpoint that lets Contract Sentinel run a short Java Flight Recorder
 * session against this service and pull the resulting {@code .jfr} binary for hotspot analysis.
 *
 * <ul>
 *   <li>{@code POST /actuator/jfr}            — start a recording ({@code {"durationSeconds": 20}})</li>
 *   <li>{@code GET  /actuator/jfr}            — recording status</li>
 *   <li>{@code GET  /actuator/jfr/download}   — base64 of the last completed recording</li>
 * </ul>
 *
 * Only {@code jdk.ExecutionSample} events are captured, sampled every 10ms, so the payload
 * stays small (a few MB) and safe to ship as base64 over the actuator HTTP channel.
 */
@Component
@Endpoint(id = "jfr")
public class JfrProfilingEndpoint {

    private static final int MIN_SECONDS = 10;
    private static final int MAX_SECONDS = 30;
    private static final int DEFAULT_SECONDS = 20;

    private final AtomicReference<Recording> active = new AtomicReference<>();
    private volatile Path lastDump;
    private volatile Instant startedAt;
    private volatile Instant endsAt;
    private volatile int lastDurationSeconds;

    @WriteOperation
    public Map<String, Object> start(@Nullable Integer durationSeconds) {
        Recording current = active.get();
        if (current != null && current.getState() == RecordingState.RUNNING) {
            throw new IllegalStateException("A JFR recording is already in progress");
        }
        int seconds = clamp(durationSeconds == null ? DEFAULT_SECONDS : durationSeconds);
        try {
            if (current != null) {
                current.close();
            }
            if (lastDump != null) {
                Files.deleteIfExists(lastDump);
                lastDump = null;
            }

            Path dest = Files.createTempFile("sentinel-jfr-", ".jfr");
            Recording recording = new Recording();
            recording.setName("contract-sentinel-hotspot");
            recording.enable("jdk.ExecutionSample").withPeriod(Duration.ofMillis(10));
            recording.setDuration(Duration.ofSeconds(seconds));
            recording.setToDisk(true);
            recording.setDestination(dest);
            recording.start();

            active.set(recording);
            lastDump = dest;
            lastDurationSeconds = seconds;
            startedAt = Instant.now();
            endsAt = startedAt.plusSeconds(seconds);
            return status();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to start JFR recording: " + e.getMessage(), e);
        }
    }

    @ReadOperation
    public Map<String, Object> status() {
        Recording recording = active.get();
        String state;
        if (recording == null) {
            state = lastDump != null ? "COMPLETE" : "IDLE";
        } else if (recording.getState() == RecordingState.RUNNING) {
            state = "RUNNING";
        } else {
            // Duration elapsed — JFR has stopped and flushed to the destination file.
            recording.close();
            active.compareAndSet(recording, null);
            state = "COMPLETE";
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("state", state);
        result.put("startedAt", startedAt);
        result.put("endsAt", endsAt);
        result.put("durationSeconds", lastDurationSeconds);
        result.put("sizeBytes", currentSizeBytes());
        return result;
    }

    @ReadOperation
    public Map<String, Object> download(@Selector String action) {
        if (!"download".equals(action)) {
            throw new IllegalArgumentException("Unknown JFR action: " + action);
        }
        if (lastDump == null || !Files.exists(lastDump)) {
            throw new IllegalStateException("No completed JFR recording available to download");
        }
        try {
            byte[] bytes = Files.readAllBytes(lastDump);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("data", Base64.getEncoder().encodeToString(bytes));
            result.put("sizeBytes", bytes.length);
            return result;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read JFR recording: " + e.getMessage(), e);
        }
    }

    private long currentSizeBytes() {
        try {
            if (lastDump != null && Files.exists(lastDump)) {
                return Files.size(lastDump);
            }
        } catch (IOException ignored) {
            // best effort
        }
        return 0L;
    }

    private int clamp(int seconds) {
        return Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, seconds));
    }
}
