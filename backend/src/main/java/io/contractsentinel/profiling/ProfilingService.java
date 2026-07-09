package io.contractsentinel.profiling;

import java.util.List;
import java.util.UUID;

public interface ProfilingService {

    /** Kick off a profiling run (returns immediately; work continues asynchronously). */
    ProfilingRunDto start(UUID serviceId, int durationSeconds);

    ProfilingRunDto getRun(UUID runId);

    List<ProfilingRunDto> history(UUID serviceId);
}
