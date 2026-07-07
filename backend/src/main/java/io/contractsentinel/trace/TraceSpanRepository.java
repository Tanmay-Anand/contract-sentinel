package io.contractsentinel.trace;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface TraceSpanRepository extends JpaRepository<TraceSpan, UUID> {

    List<TraceSpan> findByTraceIdOrderByStartEpochMicros(String traceId);

    List<TraceSpan> findByReceivedAtAfter(Instant after, Pageable pageable);

    void deleteByReceivedAtBefore(Instant cutoff);
}
