package io.contractsentinel.profiling;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ProfilingRunDto(
        UUID id,
        UUID serviceId,
        String serviceName,
        String status,
        int durationSeconds,
        Instant startedAt,
        Instant completedAt,
        String errorMessage,
        long totalSamples,
        List<HotMethodDto> hotMethods
) {
    public static ProfilingRunDto from(ProfilingRun run, List<HotMethodDto> hotMethods) {
        return new ProfilingRunDto(
                run.getId(),
                run.getService().getId(),
                run.getService().getName(),
                run.getStatus().name(),
                run.getDurationSeconds(),
                run.getStartedAt(),
                run.getCompletedAt(),
                run.getErrorMessage(),
                run.getTotalSamples(),
                hotMethods
        );
    }
}
