package io.contractsentinel.registry;

import io.contractsentinel.drift.DriftEvent;
import io.contractsentinel.drift.DriftEventRepository;
import io.contractsentinel.snapshot.SpecSnapshotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ServiceRegistryServiceImpl implements ServiceRegistryService {

    private final ServiceRegistryRepository repository;
    private final DriftEventRepository driftEventRepository;
    private final SpecSnapshotRepository snapshotRepository;

    @Override
    @Transactional(readOnly = true)
    public List<ServiceRegistryDto> findAll() {
        return repository.findAllByActiveTrue().stream()
                .map(service -> {
                    String status = resolveStatus(service);
                    long breaking = driftEventRepository
                            .countByServiceAndSeverityAndAcknowledgedFalse(service, DriftEvent.Severity.BREAKING);
                    return ServiceRegistryDto.from(service, status, breaking);
                })
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ServiceRegistryDto findById(UUID id) {
        ServiceRegistry s = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Service not found: " + id));
        String status = resolveStatus(s);
        long breaking = driftEventRepository
                .countByServiceAndSeverityAndAcknowledgedFalse(s, DriftEvent.Severity.BREAKING);
        return ServiceRegistryDto.from(s, status, breaking);
    }

    private String resolveStatus(ServiceRegistry service) {
        return snapshotRepository.findTopByServiceOrderByFetchedAtDesc(service)
                .map(snap -> switch (snap.getFetchStatus()) {
                    case FETCHED -> "HEALTHY";
                    case UNREACHABLE -> "UNREACHABLE";
                    case PARSE_FAILED -> "PARSE_FAILED";
                })
                .orElse("UNKNOWN");
    }
}
