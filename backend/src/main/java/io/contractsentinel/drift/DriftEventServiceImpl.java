package io.contractsentinel.drift;

import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.snapshot.SpecSnapshot;
import io.contractsentinel.snapshot.SpecSnapshotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DriftEventServiceImpl implements DriftEventService {

    private final DriftEventRepository driftEventRepository;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final SpecSnapshotRepository snapshotRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<DriftEventDto> list(UUID serviceId, String severity, Pageable pageable) {
        if (serviceId != null && severity != null) {
            ServiceRegistry service = findServiceOrThrow(serviceId);
            return driftEventRepository.findByServiceAndSeverityOrderByDetectedAtDesc(
                    service, DriftEvent.Severity.valueOf(severity.toUpperCase()), pageable)
                    .map(DriftEventDto::from);
        }
        if (serviceId != null) {
            ServiceRegistry service = findServiceOrThrow(serviceId);
            return driftEventRepository.findByServiceOrderByDetectedAtDesc(service, pageable)
                    .map(DriftEventDto::from);
        }
        if (severity != null) {
            return driftEventRepository.findBySeverityOrderByDetectedAtDesc(
                    DriftEvent.Severity.valueOf(severity.toUpperCase()), pageable)
                    .map(DriftEventDto::from);
        }
        return driftEventRepository.findAllByOrderByDetectedAtDesc(pageable)
                .map(DriftEventDto::from);
    }

    @Override
    @Transactional
    public DriftEventDto acknowledge(UUID id) {
        DriftEvent event = driftEventRepository.findById(id)
                .orElseThrow(() -> SentinelException.notFound("Drift event not found: " + id, RequestContext.getRequestId()));
        event.setAcknowledged(true);
        return DriftEventDto.from(driftEventRepository.save(event));
    }

    @Override
    @Transactional
    public DriftEventDto unacknowledge(UUID id) {
        DriftEvent event = driftEventRepository.findById(id)
                .orElseThrow(() -> SentinelException.notFound("Drift event not found: " + id, RequestContext.getRequestId()));
        event.setAcknowledged(false);
        return DriftEventDto.from(driftEventRepository.save(event));
    }

    @Override
    @Transactional(readOnly = true)
    public SpecDiffDto getDiff(UUID toSnapshotId) {
        SpecSnapshot toSnapshot = snapshotRepository.findById(toSnapshotId)
                .orElseThrow(() -> SentinelException.notFound("Snapshot not found: " + toSnapshotId, RequestContext.getRequestId()));

        List<DriftEvent> events = driftEventRepository.findByToSnapshotId(toSnapshotId);

        long totalBreaking = events.stream()
                .filter(e -> e.getSeverity() == DriftEvent.Severity.BREAKING)
                .count();
        long totalSafe = events.stream()
                .filter(e -> e.getSeverity() == DriftEvent.Severity.SAFE)
                .count();

        Map<String, List<DriftEvent>> grouped = events.stream()
                .collect(Collectors.groupingBy(e -> {
                    String method = e.getHttpMethod() != null ? e.getHttpMethod() : "";
                    String path = e.getApiPath() != null ? e.getApiPath() : "";
                    return method + ":" + path;
                }));

        List<DiffGroupDto> groups = grouped.entrySet().stream()
                .map(entry -> {
                    String key = entry.getKey();
                    int colonIdx = key.indexOf(':');
                    String method = colonIdx >= 0 ? key.substring(0, colonIdx) : key;
                    String path = colonIdx >= 0 ? key.substring(colonIdx + 1) : "";
                    List<DiffChangeDto> changes = entry.getValue().stream()
                            .map(DiffChangeDto::from)
                            .collect(Collectors.toList());
                    return new DiffGroupDto(method, path, changes);
                })
                .collect(Collectors.toList());

        Instant detectedAt = events.stream()
                .map(DriftEvent::getDetectedAt)
                .min(Instant::compareTo)
                .orElse(toSnapshot.getFetchedAt());

        UUID fromSnapshotId = events.stream()
                .filter(e -> e.getFromSnapshot() != null)
                .map(e -> e.getFromSnapshot().getId())
                .findFirst()
                .orElse(null);

        return new SpecDiffDto(fromSnapshotId, toSnapshotId, detectedAt, totalBreaking, totalSafe, groups);
    }

    private ServiceRegistry findServiceOrThrow(UUID serviceId) {
        return serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));
    }
}
