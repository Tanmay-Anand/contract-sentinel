package io.contractsentinel.trace;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface TraceSpanRepository extends JpaRepository<TraceSpan, UUID> {

    List<TraceSpan> findByTraceIdOrderByStartEpochMicros(String traceId);

    List<TraceSpan> findByReceivedAtAfter(Instant after, Pageable pageable);

    // Batched purge: fetch a page of IDs then delete by ID, avoiding a single massive DELETE
    // that would lock the table and generate excessive WAL.
    @Query("SELECT t.id FROM TraceSpan t WHERE t.receivedAt < :cutoff ORDER BY t.receivedAt")
    List<UUID> findIdsByReceivedAtBefore(@Param("cutoff") Instant cutoff, Pageable pageable);

    @Modifying
    @Query("DELETE FROM TraceSpan t WHERE t.id IN :ids")
    void deleteByIds(@Param("ids") List<UUID> ids);
}
