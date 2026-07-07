package io.contractsentinel.alert;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cs_alert_configs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AlertConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AlertChannel channel;

    @Column(nullable = false, length = 500)
    private String destination;

    @Column(nullable = false)
    @Builder.Default
    private boolean triggerOnBreaking = true;

    @Column(nullable = false)
    @Builder.Default
    private boolean triggerOnUnreachable = true;

    @Column(nullable = false)
    @Builder.Default
    private boolean triggerOnSafe = false;

    @Column(nullable = true)
    private UUID serviceFilter;

    @Column(nullable = false)
    @Builder.Default
    private int cooldownMinutes = 30;

    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = true;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
