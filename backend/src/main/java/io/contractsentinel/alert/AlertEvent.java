package io.contractsentinel.alert;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_alert_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AlertEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID configId;

    @Column(nullable = false)
    private UUID serviceId;

    @Column(nullable = false, length = 100)
    private String serviceName;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private AlertTriggerType triggerType;

    @Column(columnDefinition = "text")
    private String message;

    @Column(nullable = false)
    @Builder.Default
    private boolean delivered = false;

    @Column(columnDefinition = "text")
    private String errorMessage;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant firedAt = Instant.now();
}
