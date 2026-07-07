package io.contractsentinel.trace;

import java.util.List;

public interface TraceService {

    void ingest(List<ZipkinSpanDto> spans);

    List<TraceSummaryDto> listTraces(String serviceName, Long minDurationMs, int sinceMinutes, int limit);

    TraceTreeDto getTrace(String traceId);

    void purgeOlderThan(int retentionHours);
}
