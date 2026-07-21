package io.contractsentinel.migration;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One Flyway migration entry as seen from a registered service's /actuator/flyway response
 * or from scanning its migration scripts directory on disk.
 *
 * <p>Unique per (serviceId, script) â€” the script filename is the natural stable key Flyway uses.
 * ACTUATOR rows always win over FILESYSTEM rows: when the actuator reports a version that was
 * previously only known from disk, the row is updated in-place.
 */
@Entity
@Table(
        name = "cs_migration_records",
        uniqueConstraints = @UniqueConstraint(columnNames = {"service_id", "script"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CsMigrationRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "service_id", nullable = false)
    private UUID serviceId;

    @Column(name = "service_name", nullable = false, length = 100)
    private String serviceName;

    /** Flyway version string, e.g. "42" or "1.2.3". Null for repeatable migrations. */
    @Column(length = 50)
    private String version;

    @Column(length = 200)
    private String description;

    /** Script filename, e.g. "V42__Add_booking_source_lead.sql". Always non-null. */
    @Column(nullable = false, length = 300)
    private String script;

    /** Migration type: SQL, JDBC, SPRING_JDBC, BASELINE. */
    @Column(length = 20)
    private String type;

    /**
     * Flyway state as reported by the actuator, or our synthetic FILESYSTEM_ONLY state.
     *
     * <p>Actuator states: SUCCESS, PENDING, FAILED, OUT_OF_ORDER, MISSING_SUCCESS,
     * MISSING_FAILED, ABOVE_TARGET, BASELINE, IGNORED.
     * <p>Synthetic: FILESYSTEM_ONLY â€” script file exists on disk but has not appeared in
     * the actuator response at all (JVM hasn't scanned that classpath yet; requires restart).
     */
    @Column(nullable = false, length = 30)
    private String state;

    private Integer checksum;

    private Instant installedOn;

    @Column(length = 100)
    private String installedBy;

    /** Execution time in milliseconds as reported by Flyway. */
    private Integer executionTime;

    /**
     * Where this record came from: ACTUATOR (fetched from /actuator/flyway endpoint) or
     * FILESYSTEM (detected by scanning the migration scripts directory on disk).
     */
    @Column(nullable = false, length = 20)
    private String source;

    /** When CS last synced this record. */
    @Column(nullable = false)
    private Instant snapshotAt;
}
