package io.contractsentinel.deployment;

import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class DeploymentServiceImpl implements DeploymentService {

    private final DeploymentRepository deploymentRepository;
    private final ServiceRegistryRepository serviceRegistryRepository;

    @Override
    @Transactional
    public void detectAndRecord(ServiceRegistry service, Map<String, Object> actuatorInfo) {
        String gitCommit = extractGitCommit(actuatorInfo);
        String gitBranch = extractGitBranch(actuatorInfo);
        String buildVersion = extractBuildVersion(actuatorInfo);
        String buildTime = extractBuildTime(actuatorInfo);

        Optional<DeploymentEvent> lastEvent = deploymentRepository.findTopByServiceOrderByDetectedAtDesc(service);

        boolean shouldRecord = false;
        if (gitCommit != null) {
            String lastCommit = lastEvent.map(DeploymentEvent::getGitCommit).orElse(null);
            shouldRecord = !gitCommit.equals(lastCommit);
        } else if (buildVersion != null) {
            String lastVersion = lastEvent.map(DeploymentEvent::getBuildVersion).orElse(null);
            shouldRecord = !buildVersion.equals(lastVersion);
        } else {
            shouldRecord = lastEvent.isEmpty();
        }

        if (shouldRecord) {
            DeploymentEvent event = DeploymentEvent.builder()
                    .service(service)
                    .buildVersion(buildVersion)
                    .buildTime(buildTime)
                    .gitCommit(gitCommit)
                    .gitBranch(gitBranch)
                    .build();
            deploymentRepository.save(event);
            log.info("Recorded new deployment event for service {} (commit={}, version={})",
                    service.getName(), gitCommit, buildVersion);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Page<DeploymentEventDto> listByService(UUID serviceId, Pageable pageable) {
        ServiceRegistry service = findServiceOrThrow(serviceId);
        return deploymentRepository.findByServiceOrderByDetectedAtDesc(service, pageable)
                .map(DeploymentEventDto::from);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<DeploymentEventDto> latestByService(UUID serviceId) {
        ServiceRegistry service = findServiceOrThrow(serviceId);
        return deploymentRepository.findTopByServiceOrderByDetectedAtDesc(service)
                .map(DeploymentEventDto::from);
    }

    private ServiceRegistry findServiceOrThrow(UUID serviceId) {
        return serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));
    }

    @SuppressWarnings("unchecked")
    private String extractGitCommit(Map<String, Object> info) {
        try {
            Map<String, Object> git = (Map<String, Object>) info.get("git");
            if (git == null) return null;
            Map<String, Object> commit = (Map<String, Object>) git.get("commit");
            if (commit == null) return null;
            Object id = commit.get("id");
            return id != null ? id.toString() : null;
        } catch (ClassCastException e) {
            log.debug("Could not extract git.commit.id from actuator info: {}", e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private String extractGitBranch(Map<String, Object> info) {
        try {
            Map<String, Object> git = (Map<String, Object>) info.get("git");
            if (git == null) return null;
            Object branch = git.get("branch");
            return branch != null ? branch.toString() : null;
        } catch (ClassCastException e) {
            log.debug("Could not extract git.branch from actuator info: {}", e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private String extractBuildVersion(Map<String, Object> info) {
        try {
            Map<String, Object> build = (Map<String, Object>) info.get("build");
            if (build == null) return null;
            Object version = build.get("version");
            return version != null ? version.toString() : null;
        } catch (ClassCastException e) {
            log.debug("Could not extract build.version from actuator info: {}", e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private String extractBuildTime(Map<String, Object> info) {
        try {
            Map<String, Object> build = (Map<String, Object>) info.get("build");
            if (build == null) return null;
            Object time = build.get("time");
            return time != null ? time.toString() : null;
        } catch (ClassCastException e) {
            log.debug("Could not extract build.time from actuator info: {}", e.getMessage());
            return null;
        }
    }
}
