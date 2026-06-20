package io.contractsentinel.snapshot;

import io.contractsentinel.config.RequestContext;
import io.contractsentinel.drift.DriftDetectionService;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class SpecSnapshotServiceImpl implements SpecSnapshotService {

    private final SpecSnapshotRepository snapshotRepository;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final SpecFetcherScheduler fetcherScheduler;
    private final DriftDetectionService driftDetectionService;

    @Override
    @Transactional(readOnly = true)
    public Page<SpecSnapshotDto> listByService(UUID serviceId, Pageable pageable) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));
        return snapshotRepository.findByServiceOrderByFetchedAtDesc(service, pageable)
                .map(SpecSnapshotDto::from);
    }

    @Override
    public String pollAll() {
        fetcherScheduler.pollAll();
        return "Poll triggered for all active services";
    }

    @Override
    public String pollOne(UUID serviceId) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));
        fetcherScheduler.pollService(service);
        return "Poll triggered for " + service.getName();
    }

    @Override
    @Transactional
    public String redetect(UUID serviceId) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));

        Optional<SpecSnapshot> oldest = snapshotRepository
                .findTopByServiceAndFetchStatusOrderByFetchedAtAsc(service, SpecSnapshot.FetchStatus.FETCHED);
        Optional<SpecSnapshot> newest = snapshotRepository
                .findTopByServiceAndFetchStatusOrderByFetchedAtDesc(service, SpecSnapshot.FetchStatus.FETCHED);

        if (oldest.isEmpty() || newest.isEmpty()) {
            return "No snapshots found for " + service.getName() + " — poll first";
        }
        if (oldest.get().getId().equals(newest.get().getId())) {
            return "Only one snapshot exists for " + service.getName() + " — nothing to compare";
        }

        log.info("Force re-detecting drift for {} between oldest ({}) and newest ({})",
                service.getName(), oldest.get().getFetchedAt(), newest.get().getFetchedAt());

        driftDetectionService.detectAndPersist(service, oldest.get(), newest.get());
        return "Re-detection complete for " + service.getName()
                + " (compared " + oldest.get().getFetchedAt() + " → " + newest.get().getFetchedAt() + ")";
    }
}
