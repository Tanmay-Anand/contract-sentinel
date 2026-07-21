package io.contractsentinel.graph;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.drift.DriftEvent;
import io.contractsentinel.drift.DriftEventRepository;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.snapshot.SpecSnapshot;
import io.contractsentinel.snapshot.SpecSnapshotRepository;
import io.contractsentinel.stats.OutboundCallCounter;
import io.contractsentinel.trace.TraceSpan;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.time.Instant;
import java.util.*;
import java.util.stream.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class DependencyGraphServiceImpl implements DependencyGraphService {

    private final ServiceDependencyRepository dependencyRepository;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final SpecSnapshotRepository snapshotRepository;
    private final DriftEventRepository driftEventRepository;
    private final OutboundLatencyCollector outboundLatencyCollector;
    private final OutboundCallCounter callCounter;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    @Override
    @Transactional(readOnly = true)
    public ServiceGraphDto getGraph() {
        List<ServiceRegistry> activeServices = serviceRegistryRepository.findAllByActiveTrue();
        List<ServiceDependency> allEdges = dependencyRepository.findAll();

        List<ServiceNodeDto> nodes = activeServices.stream().map(svc -> {
            Optional<SpecSnapshot> latestSnapshot = snapshotRepository.findTopByServiceOrderByFetchedAtDesc(svc);
            String status = latestSnapshot
                    .map(snap -> snap.getFetchStatus().name())
                    .orElse("NEVER_POLLED");

            int breakingChanges = (int) driftEventRepository.countByServiceAndSeverityAndAcknowledgedFalse(
                    svc, DriftEvent.Severity.BREAKING);

            boolean hasStaleEdges = allEdges.stream()
                    .filter(edge -> edge.getSourceService().getId().equals(svc.getId()))
                    .anyMatch(ServiceDependency::isStale);

            return ServiceNodeDto.from(svc, status, breakingChanges, hasStaleEdges);
        }).collect(Collectors.toList());

        List<ServiceEdgeDto> edges = allEdges.stream()
                .map(ServiceEdgeDto::from)
                .map(edge -> {
                    Double avgMs = outboundLatencyCollector.latencyFor(edge.sourceId(), edge.targetId());
                    return avgMs != null ? edge.withLatency(avgMs, OutboundLatencyCollector.bandFor(avgMs)) : edge;
                })
                .collect(Collectors.toList());

        return new ServiceGraphDto(nodes, edges, Instant.now());
    }

    @Override
    @Transactional
    public void scanDependencies(ServiceRegistry source) {
        String contextPath = contextPathFrom(source.getSpecPath());
        String envUrl = source.getBaseUrl() + contextPath + "/actuator/env";

        try {
            String json = restClient.get()
                    .uri(envUrl)
                    .retrieve()
                    .body(String.class);

            callCounter.incActuatorEnv();
            Map<String, Object> envRoot = objectMapper.readValue(json, new TypeReference<>() {});

            Map<String, String> flatProps = new LinkedHashMap<>();
            List<Map<String, Object>> sources = (List<Map<String, Object>>) envRoot.get("propertySources");
            if (sources != null) {
                for (Map<String, Object> propSource : sources) {
                    Map<String, Object> props = (Map<String, Object>) propSource.get("properties");
                    if (props == null) {
                        continue;
                    }
                    for (Map.Entry<String, Object> e : props.entrySet()) {
                        Object valObj = e.getValue();
                        if (valObj instanceof Map valMap) {
                            Object val = valMap.get("value");
                            if (val instanceof String s) {
                                flatProps.putIfAbsent(e.getKey(), s);
                            }
                        }
                    }
                }
            }

            List<ServiceRegistry> activeServices = serviceRegistryRepository.findAllByActiveTrue();
            Instant now = Instant.now();

            for (ServiceRegistry target : activeServices) {
                if (target.getId().equals(source.getId())) {
                    continue;
                }
                URI targetUri;
                try {
                    targetUri = URI.create(target.getBaseUrl());
                } catch (Exception ex) {
                    log.debug("Could not parse baseUrl '{}' for service '{}'",
                            target.getBaseUrl(), target.getName());
                    continue;
                }
                String targetHost = targetUri.getHost();
                int targetPort = targetUri.getPort(); // -1 when not specified

                List<String> matchPatterns = new ArrayList<>();
                if (targetPort > 0) {
                    matchPatterns.add("localhost:" + targetPort);
                    matchPatterns.add("127.0.0.1:" + targetPort);
                }
                // Match real host:port so non-local deployments (staging/prod) are detected
                if (targetHost != null && !targetHost.equals("localhost") && !targetHost.equals("127.0.0.1")) {
                    matchPatterns.add(targetPort > 0 ? targetHost + ":" + targetPort : targetHost);
                }
                // Full baseUrl as fallback (env property may store entire URL)
                matchPatterns.add(target.getBaseUrl());

                for (Map.Entry<String, String> propEntry : flatProps.entrySet()) {
                    String propValue = propEntry.getValue();
                    if (propValue != null && matchPatterns.stream().anyMatch(propValue::contains)) {
                        upsertEdge(source, target, propEntry.getKey(),
                                ServiceDependency.DetectionMethod.ACTUATOR_ENV,
                                ServiceDependency.Confidence.HIGH,
                                now);
                        break;
                    }
                }
            }

        } catch (Exception ex) {
            log.debug("Actuator env scan failed for service '{}' at '{}': {}", source.getName(), envUrl, ex.getMessage());
            List<ServiceDependency> existingEdges = dependencyRepository.findBySourceService(source);
            Instant failedAt = Instant.now();
            for (ServiceDependency edge : existingEdges) {
                edge.setScanFailedAt(failedAt);
            }
            dependencyRepository.saveAll(existingEdges);
        }
    }

    @Override
    @Transactional
    public void scanAll() {
        List<ServiceRegistry> activeServices = serviceRegistryRepository.findAllByActiveTrue();
        for (ServiceRegistry svc : activeServices) {
            scanDependencies(svc);
        }
    }

    @Override
    @Transactional
    public ServiceEdgeDto addManual(ManualDependencyRequest req) {
        ServiceRegistry source = serviceRegistryRepository.findById(req.sourceServiceId())
                .orElseThrow(() -> SentinelException.notFound(
                        "Source service not found: " + req.sourceServiceId(), RequestContext.getRequestId()));

        ServiceRegistry target = serviceRegistryRepository.findById(req.targetServiceId())
                .orElseThrow(() -> SentinelException.notFound(
                        "Target service not found: " + req.targetServiceId(), RequestContext.getRequestId()));

        dependencyRepository.findBySourceServiceAndTargetServiceAndDetectionMethod(
                source, target, ServiceDependency.DetectionMethod.MANUAL)
                .ifPresent(existing -> {
                    throw new IllegalArgumentException(
                            "Manual dependency already exists between '" + source.getName()
                                    + "' and '" + target.getName() + "'");
                });

        ServiceDependency saved = dependencyRepository.save(ServiceDependency.builder()
                .sourceService(source)
                .targetService(target)
                .detectionMethod(ServiceDependency.DetectionMethod.MANUAL)
                .confidence(ServiceDependency.Confidence.HIGH)
                .verifiedAt(Instant.now())
                .propertyName(req.label())
                .build());

        return ServiceEdgeDto.from(saved);
    }

    @Override
    @Transactional
    public void removeEdge(UUID edgeId) {
        ServiceDependency edge = dependencyRepository.findById(edgeId)
                .orElseThrow(() -> SentinelException.notFound(
                        "Dependency edge not found: " + edgeId, RequestContext.getRequestId()));
        dependencyRepository.delete(edge);
    }

    @Override
    @Transactional(readOnly = true)
    public BlastRadiusDto getBlastRadius(UUID serviceId) {
        ServiceRegistry epicenter = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound(
                        "Service not found: " + serviceId, RequestContext.getRequestId()));

        Set<UUID> direct = new LinkedHashSet<>();
        Set<UUID> transitive = new LinkedHashSet<>();
        Set<UUID> visited = new HashSet<>();
        visited.add(serviceId);

        dependencyRepository.findByTargetServiceId(serviceId).forEach(edge -> {
            UUID srcId = edge.getSourceService().getId();
            if (visited.add(srcId)) {
                direct.add(srcId);
            }
        });

        Queue<UUID> queue = new LinkedList<>(direct);
        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            dependencyRepository.findByTargetServiceId(current).forEach(edge -> {
                UUID srcId = edge.getSourceService().getId();
                if (visited.add(srcId)) {
                    transitive.add(srcId);
                    queue.add(srcId);
                }
            });
        }

        return new BlastRadiusDto(
                serviceId,
                epicenter.getName(),
                new ArrayList<>(direct),
                new ArrayList<>(transitive),
                direct.size() + transitive.size()
        );
    }

    @Override
    @Transactional
    public void deriveEdgesFromSpans(List<TraceSpan> spans) {
        if (spans == null || spans.isEmpty()) return;

        // Build parentSpanId → children map within this batch
        Map<String, List<TraceSpan>> childrenByParent = new HashMap<>();
        for (TraceSpan s : spans) {
            if (s.getParentSpanId() != null) {
                childrenByParent.computeIfAbsent(s.getParentSpanId(), k -> new ArrayList<>()).add(s);
            }
        }

        // Index registered services by lower-cased name for fast lookup
        List<ServiceRegistry> activeServices = serviceRegistryRepository.findAllByActiveTrue();
        Map<String, ServiceRegistry> byName = new HashMap<>();
        for (ServiceRegistry svc : activeServices) {
            byName.put(svc.getName().toLowerCase(), svc);
        }

        Instant now = Instant.now();
        for (TraceSpan span : spans) {
            // A CLIENT span in service A calling service B produces a SERVER child span in B
            if (!"CLIENT".equalsIgnoreCase(span.getKind())) continue;
            List<TraceSpan> children = childrenByParent.get(span.getSpanId());
            if (children == null) continue;
            for (TraceSpan child : children) {
                if (!"SERVER".equalsIgnoreCase(child.getKind())) continue;
                if (span.getServiceName() == null || child.getServiceName() == null) continue;
                if (span.getServiceName().equalsIgnoreCase(child.getServiceName())) continue;
                ServiceRegistry src = byName.get(span.getServiceName().toLowerCase());
                ServiceRegistry tgt = byName.get(child.getServiceName().toLowerCase());
                if (src == null || tgt == null) continue;
                String label = child.getHttpMethod() != null && child.getHttpPath() != null
                        ? child.getHttpMethod().toUpperCase() + " " + child.getHttpPath() : null;
                upsertEdge(src, tgt, label, ServiceDependency.DetectionMethod.TRACE,
                        ServiceDependency.Confidence.MEDIUM, now);
            }
        }
    }

    @Transactional
    private void upsertEdge(ServiceRegistry source, ServiceRegistry target, String propertyName,
                             ServiceDependency.DetectionMethod method,
                             ServiceDependency.Confidence confidence,
                             Instant now) {
        dependencyRepository.findBySourceServiceAndTargetServiceAndDetectionMethod(source, target, method)
                .ifPresentOrElse(
                        existing -> {
                            existing.setVerifiedAt(now);
                            existing.setPropertyName(propertyName);
                            dependencyRepository.save(existing);
                        },
                        () -> dependencyRepository.save(ServiceDependency.builder()
                                .sourceService(source)
                                .targetService(target)
                                .detectionMethod(method)
                                .propertyName(propertyName)
                                .confidence(confidence)
                                .verifiedAt(now)
                                .build())
                );
    }

    private String contextPathFrom(String specPath) {
        if (specPath == null) {
            return "";
        }
        int idx = specPath.lastIndexOf("/v3/api-docs");
        if (idx <= 0) {
            return "";
        }
        return specPath.substring(0, idx);
    }
}
