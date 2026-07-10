package io.contractsentinel.profiling;

import jdk.jfr.consumer.RecordedEvent;
import jdk.jfr.consumer.RecordedFrame;
import jdk.jfr.consumer.RecordedStackTrace;
import jdk.jfr.consumer.RecordingFile;

import java.io.IOException;
import java.nio.file.Path;
import java.util.*;

/**
 * Aggregates {@code jdk.ExecutionSample} events from a {@code .jfr} recording into the hottest
 * application methods. Events are streamed one at a time (never {@code readAllEvents}) so multi-MB
 * recordings don't blow up the heap. Frames in the JDK/runtime are skipped in favour of the first
 * application frame â€” the method a developer can actually act on.
 */
public final class JfrParser {

    private static final String EXECUTION_SAMPLE = "jdk.ExecutionSample";
    private static final List<String> RUNTIME_PREFIXES = List.of(
            "java.", "jdk.", "sun.", "com.sun.", "javax.", "kotlin.");

    public record FrameCount(String frame, long samples) {}

    public record ParsedProfile(long totalSamples, List<FrameCount> frames) {}

    private JfrParser() {}

    public static ParsedProfile topFrames(Path jfrFile, int topN) throws IOException {
        Map<String, Long> counts = new HashMap<>();
        long total = 0;

        try (RecordingFile recordingFile = new RecordingFile(jfrFile)) {
            while (recordingFile.hasMoreEvents()) {
                RecordedEvent event = recordingFile.readEvent();
                if (!EXECUTION_SAMPLE.equals(event.getEventType().getName())) {
                    continue;
                }
                RecordedStackTrace stackTrace = event.getStackTrace();
                if (stackTrace == null) {
                    continue;
                }
                String frame = firstAppFrame(stackTrace);
                if (frame == null) {
                    continue;
                }
                counts.merge(frame, 1L, Long::sum);
                total++;
            }
        }

        long finalTotal = total;
        List<FrameCount> frames = counts.entrySet().stream()
                .map(e -> new FrameCount(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingLong(FrameCount::samples).reversed())
                .limit(topN)
                .toList();

        return new ParsedProfile(finalTotal, frames);
    }

    private static String firstAppFrame(RecordedStackTrace stackTrace) {
        List<RecordedFrame> frames = stackTrace.getFrames();
        RecordedFrame topJavaFrame = null;
        for (RecordedFrame frame : frames) {
            if (!frame.isJavaFrame() || frame.getMethod() == null) {
                continue;
            }
            String typeName = frame.getMethod().getType() != null
                    ? frame.getMethod().getType().getName() : "";
            if (topJavaFrame == null) {
                topJavaFrame = frame;
            }
            if (!isRuntime(typeName)) {
                return typeName + "." + frame.getMethod().getName();
            }
        }
        if (topJavaFrame != null && topJavaFrame.getMethod().getType() != null) {
            return topJavaFrame.getMethod().getType().getName() + "." + topJavaFrame.getMethod().getName();
        }
        return null;
    }

    private static boolean isRuntime(String typeName) {
        for (String prefix : RUNTIME_PREFIXES) {
            if (typeName.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
}
