package io.contractsentinel.profiling;

import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ProfilingServiceImpl implements ProfilingService {

    private static final List<ProfilingRun.Status> ACTIVE = List.of(
            ProfilingRun.Status.REQUESTED, ProfilingRun.Status.RECORDING,
            ProfilingRun.Status.DOWNLOADING, ProfilingRun.Status.PARSING);

    private final ProfilingRunRepository runRepository;
    private final HotMethodRepository hotMethodRepository;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final ProfilingWorker profilingWorker;

    @Override
    @Transactional
    public ProfilingRunDto start(UUID serviceId, int durationSeconds) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));

        if (runRepository.existsByServiceAndStatusIn(service, ACTIVE)) {
            throw new IllegalStateException("A profiling run is already in progress for " + service.getName());
        }

        int clamped = Math.max(10, Math.min(30, durationSeconds));
        ProfilingRun run = runRepository.save(ProfilingRun.builder()
                .service(service)
                .status(ProfilingRun.Status.REQUESTED)
                .durationSeconds(clamped)
                .build());

        profilingWorker.profileAsync(run.getId());
        return ProfilingRunDto.from(run, List.of());
    }

    @Override
    @Transactional(readOnly = true)
    public ProfilingRunDto getRun(UUID runId) {
        ProfilingRun run = runRepository.findById(runId)
                .orElseThrow(() -> SentinelException.notFound("Profiling run not found: " + runId, RequestContext.getRequestId()));
        List<HotMethodDto> methods = hotMethodRepository.findByRunIdOrderByRank(runId)
                .stream().map(HotMethodDto::from).toList();
        return ProfilingRunDto.from(run, methods);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProfilingRunDto> history(UUID serviceId) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));
        return runRepository.findByServiceOrderByStartedAtDesc(service).stream()
                .map(run -> ProfilingRunDto.from(run,
                        hotMethodRepository.findByRunIdOrderByRank(run.getId()).stream().map(HotMethodDto::from).toList()))
                .toList();
    }
}
