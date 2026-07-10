package io.contractsentinel.graph;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.stats.OutboundCallCounter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class OutboundCallScannerService {

    private final ServiceDependencyRepository dependencyRepository;
    private final OutboundCallCounter callCounter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final RestClient restClient = RestClient.builder()
            .requestFactory(factory())
            .build();

    private static SimpleClientHttpRequestFactory factory() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(5));
        f.setReadTimeout(Duration.ofSeconds(10));
        return f;
    }

    // Called after each dependency graph scan for a service.
    // Fetches /actuator/outbound-clients and writes endpoint call JSON onto matching edges.
    @Transactional
    public void scanAndEnrich(ServiceRegistry source) {
        String contextPath = contextPathFrom(source.getSpecPath());
        String url = source.getBaseUrl() + contextPath + "/actuator/outbound-clients";

        try {
            String json = restClient.get().uri(url).retrieve().body(String.class);
            if (json == null || json.isBlank()) return;
            callCounter.incOutboundScans();

            Map<String, Object> response = objectMapper.readValue(json, new TypeReference<>() {});
            List<Map<String, Object>> clients = (List<Map<String, Object>>) response.get("clients");
            if (clients == null) return;

            // Group all methods by their baseUrlProperty
            Map<String, List<Map<String, String>>> methodsByProp = new LinkedHashMap<>();
            for (Map<String, Object> client : clients) {
                String prop = (String) client.get("baseUrlProperty");
                if (prop == null || prop.equals("unknown")) continue;
                @SuppressWarnings("unchecked")
                List<Map<String, String>> methods = (List<Map<String, String>>) client.get("methods");
                if (methods != null) {
                    methodsByProp.computeIfAbsent(prop, k -> new ArrayList<>()).addAll(methods);
                }
            }

            // Update matching ACTUATOR_ENV dependency edges for this source
            List<ServiceDependency> sourceDeps = dependencyRepository.findBySourceService(source);
            for (ServiceDependency dep : sourceDeps) {
                if (dep.getDetectionMethod() != ServiceDependency.DetectionMethod.ACTUATOR_ENV) continue;
                String prop = dep.getPropertyName();
                if (prop == null) continue;

                List<Map<String, String>> methods = methodsByProp.get(prop);
                if (methods == null || methods.isEmpty()) continue;

                String newJson = objectMapper.writeValueAsString(methods);
                if (!newJson.equals(dep.getEndpointCallsJson())) {
                    dep.setEndpointCallsJson(newJson);
                    dependencyRepository.save(dep);
                    log.info("Updated endpoint calls for {} → {} ({})",
                            source.getName(), dep.getTargetService().getName(), prop);
                }
            }

        } catch (Exception e) {
            log.debug("Could not fetch outbound-clients from {}: {}", source.getName(), e.getMessage());
        }
    }

    private String contextPathFrom(String specPath) {
        if (specPath == null) return "";
        int idx = specPath.lastIndexOf("/v3/api-docs");
        if (idx <= 0) return "";
        return specPath.substring(0, idx);
    }
}
