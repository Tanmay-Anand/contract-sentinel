package io.contractsentinel.usage;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.stats.OutboundCallCounter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class UsageAnalyticsServiceImpl implements UsageAnalyticsService {

    private final EndpointUsageRepository usageRepository;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final OutboundCallCounter callCounter;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    @Override
    @Transactional
    public void collectForService(ServiceRegistry service, List<String> endpointPaths) {
        for (String path : endpointPaths) {
            try {
                String url = service.getBaseUrl()
                        + "/actuator/metrics/http.server.requests?tag=uri:" + path + "&tag=method:GET";

                String responseBody = restClient.get()
                        .uri(url)
                        .retrieve()
                        .body(String.class);

                callCounter.incActuatorMetrics();
                if (responseBody == null || responseBody.isBlank()) {
                    log.warn("Empty actuator response for path {} from service {}", path, service.getName());
                    continue;
                }

                JsonNode root = objectMapper.readTree(responseBody);
                JsonNode measurements = root.path("measurements");

                long count = 0;
                if (measurements.isArray()) {
                    for (JsonNode m : measurements) {
                        if ("COUNT".equals(m.path("statistic").asText(""))) {
                            count = (long) m.path("value").asDouble(0);
                            break;
                        }
                    }
                }

                Optional<EndpointUsageSample> lastSample = usageRepository
                        .findTopByServiceAndHttpMethodAndPathOrderBySampledAtDesc(service, "GET", path);

                long previousTotal = lastSample.map(EndpointUsageSample::getTotalCount).orElse(0L);
                long delta = Math.max(0, count - previousTotal);

                EndpointUsageSample sample = EndpointUsageSample.builder()
                        .service(service)
                        .httpMethod("GET")
                        .path(path)
                        .totalCount(count)
                        .deltaCount(delta)
                        .build();
                usageRepository.save(sample);
                log.debug("Saved usage sample for {}: {} total={} delta={}", service.getName(), path, count, delta);

            } catch (Exception e) {
                log.warn("Failed to collect usage for path {} on service {}: {}", path, service.getName(), e.getMessage());
            }
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<UsageEntryDto> getSummary(UUID serviceId) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));

        // Get last sample for each unique endpoint (method+path)
        List<EndpointUsageSample> recent = usageRepository
                .findByServiceOrderBySampledAtDesc(service, PageRequest.of(0, 1000));

        Map<String, EndpointUsageSample> latestByEndpoint = new LinkedHashMap<>();
        for (EndpointUsageSample s : recent) {
            String key = s.getHttpMethod() + ":" + s.getPath();
            latestByEndpoint.putIfAbsent(key, s);
        }

        Set<String> deadKeys = getDeadEndpointKeys(service);

        return latestByEndpoint.values().stream()
                .map(s -> UsageEntryDto.from(s, deadKeys.contains(s.getHttpMethod() + ":" + s.getPath())))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<DeadEndpointDto> getDeadEndpoints(UUID serviceId) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));

        List<EndpointUsageSample> samples = usageRepository
                .findByServiceOrderBySampledAtDesc(service, PageRequest.of(0, 5000));

        // Group by endpoint key
        Map<String, List<EndpointUsageSample>> grouped = samples.stream()
                .collect(Collectors.groupingBy(s -> s.getHttpMethod() + ":" + s.getPath()));

        List<DeadEndpointDto> dead = new ArrayList<>();
        for (Map.Entry<String, List<EndpointUsageSample>> entry : grouped.entrySet()) {
            List<EndpointUsageSample> endpointSamples = entry.getValue();
            // Already ordered desc by sampledAt
            List<EndpointUsageSample> last5 = endpointSamples.stream().limit(5).collect(Collectors.toList());
            if (last5.size() < 5) {
                continue; // not enough data
            }
            boolean allZero = last5.stream().allMatch(s -> s.getDeltaCount() == 0);
            if (allZero) {
                EndpointUsageSample latest = last5.get(0);
                dead.add(new DeadEndpointDto(
                        latest.getHttpMethod(),
                        latest.getPath(),
                        latest.getTotalCount(),
                        5,
                        latest.getSampledAt()
                ));
            }
        }
        return dead;
    }

    private Set<String> getDeadEndpointKeys(ServiceRegistry service) {
        List<EndpointUsageSample> samples = usageRepository
                .findByServiceOrderBySampledAtDesc(service, PageRequest.of(0, 5000));

        Map<String, List<EndpointUsageSample>> grouped = samples.stream()
                .collect(Collectors.groupingBy(s -> s.getHttpMethod() + ":" + s.getPath()));

        Set<String> deadKeys = new HashSet<>();
        for (Map.Entry<String, List<EndpointUsageSample>> entry : grouped.entrySet()) {
            List<EndpointUsageSample> last5 = entry.getValue().stream().limit(5).collect(Collectors.toList());
            if (last5.size() >= 5 && last5.stream().allMatch(s -> s.getDeltaCount() == 0)) {
                deadKeys.add(entry.getKey());
            }
        }
        return deadKeys;
    }
}
