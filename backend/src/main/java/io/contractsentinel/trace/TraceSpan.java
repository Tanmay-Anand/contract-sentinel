package io.contractsentinel.trace;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A single span ingested from a Builder-CRM service's Micrometer/Brave tracer (Zipkin v2 format).
 * Spans sharing a {@code traceId} assemble into a request waterfall.
 */
@Entity
@Table(
        name = "cs_trace_spans",
        indexes = {
                @Index(name = "idx_trace_spans_trace", columnList = "traceId"),
                @Index(name = "idx_trace_spans_received", columnList = "receivedAt")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TraceSpan {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 32)
    private String traceId;

    @Column(nullable = false, length = 16)
    private String spanId;

    @Column(length = 16)
    private String parentSpanId;

    @Column(nullable = false, length = 120)
    private String serviceName;

    @Column(length = 400)
    private String spanName;

    @Column(length = 20)
    private String kind;

    @Column(nullable = false)
    private long startEpochMicros;

    @Column(nullable = false)
    private long durationMicros;

    @Column(length = 10)
    private String httpMethod;

    @Column(length = 400)
    private String httpPath;

    private Integer httpStatus;

    @Column(columnDefinition = "text")
    private String tagsJson;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant receivedAt = Instant.now();
}
