package io.contractsentinel.infrastructure;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class InfrastructureServiceImpl implements InfrastructureService {

    private final ServiceRegistryRepository serviceRegistryRepository;
    private final NginxConfigParser nginxConfigParser;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${sentinel.docker.enabled:true}")
    private boolean dockerEnabled;

    @Value("${sentinel.gateway.url:}")
    private String gatewayUrl;

    // ── Docker containers via CLI ───────────────────────────────────────────

    @Override
    public List<ContainerDto> listContainers() {
        if (!dockerEnabled) {
            return Collections.emptyList();
        }
        try {
            // `docker ps -a --format "{{json .}}"` prints one JSON object per line.
            // Works with Docker Desktop on Windows without any TCP/TLS setting changes.
            ProcessBuilder pb = new ProcessBuilder("docker", "ps", "-a", "--format", "{{json .}}");
            pb.redirectErrorStream(true);
            Process process = pb.start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int exitCode = process.waitFor();

            if (exitCode != 0) {
                log.warn("docker ps exited with code {}: {}", exitCode, output.trim());
                return Collections.emptyList();
            }

            return output.lines()
                    .filter(line -> !line.isBlank())
                    .map(this::parseContainerLine)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toList());

        } catch (IOException e) {
            log.warn("docker CLI not found or failed to start: {}", e.getMessage());
            return Collections.emptyList();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Collections.emptyList();
        }
    }

    private ContainerDto parseContainerLine(String jsonLine) {
        try {
            Map<String, Object> raw = objectMapper.readValue(jsonLine, new TypeReference<>() {});

            String id = stringField(raw, "ID");
            // CLI "Names" is a plain string (comma-separated), not a list
            String name = stringField(raw, "Names").split(",")[0].trim();
            String image = stringField(raw, "Image");
            String status = stringField(raw, "Status");   // e.g. "Up 2 hours (healthy)"
            String state = stringField(raw, "State");     // e.g. "running"
            boolean running = "running".equalsIgnoreCase(state);
            String health = extractHealthFromStatus(status);
            List<String> ports = parsePorts(stringField(raw, "Ports"));

            return new ContainerDto(id, name, image, status, health, running, ports);
        } catch (Exception e) {
            log.warn("Could not parse docker ps line: {}", e.getMessage());
            return null;
        }
    }

    // Status strings: "Up 2 hours (healthy)", "Up 3 minutes (unhealthy)", "Up 1 minute (health: starting)", "Up 5 hours"
    private String extractHealthFromStatus(String status) {
        if (status == null) return "none";
        if (status.contains("(healthy)")) return "healthy";
        if (status.contains("(unhealthy)")) return "unhealthy";
        if (status.contains("(health:")) return "starting";
        return "none";
    }

    // "0.0.0.0:5540->5540/tcp, [::]:5540->5540/tcp" → ["5540→5540/tcp"]
    // Deduplicates IPv4 + IPv6 bindings for the same port mapping.
    private List<String> parsePorts(String ports) {
        if (ports == null || ports.isBlank()) return Collections.emptyList();

        Map<String, String> seen = new LinkedHashMap<>();
        for (String entry : ports.split(",")) {
            entry = entry.trim();
            if (entry.isEmpty()) continue;

            int arrowIdx = entry.indexOf("->");
            if (arrowIdx < 0) {
                seen.putIfAbsent(entry, entry);
                continue;
            }

            String hostPart = entry.substring(0, arrowIdx);
            String containerPart = entry.substring(arrowIdx + 2); // e.g. "5540/tcp"

            // Extract host port from "0.0.0.0:5540" or "[::]:5540"
            String hostPort;
            if (hostPart.startsWith("[")) {
                int colon = hostPart.lastIndexOf(':');
                hostPort = colon >= 0 ? hostPart.substring(colon + 1) : "";
            } else {
                int colon = hostPart.indexOf(':');
                hostPort = colon >= 0 ? hostPart.substring(colon + 1) : "";
            }

            String display = hostPort.isEmpty() ? containerPart : hostPort + "→" + containerPart;
            seen.putIfAbsent(containerPart, display); // containerPart is the dedup key
        }

        return new ArrayList<>(seen.values());
    }

    private String stringField(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v instanceof String s ? s : "";
    }

    // ── Gateway health ──────────────────────────────────────────────────────

    @Override
    public List<GatewayHealthDto> checkGatewayHealth() {
        List<ServiceRegistry> services = serviceRegistryRepository.findAllByActiveTrue();
        List<GatewayHealthDto> results = new ArrayList<>();

        for (ServiceRegistry svc : services) {
            // specPath is e.g. "/post-sales/v3/api-docs" — strip the /v3/api-docs suffix
            // to get the servlet context-path prefix used by both actuator and the app itself.
            String contextPath = contextPathFrom(svc.getSpecPath());

            String directUrl = svc.getBaseUrl() + contextPath + "/actuator/health";
            String directStatus = probeHealth(directUrl);

            String gwUrl = null;
            String gwStatus;
            if (gatewayUrl != null && !gatewayUrl.isBlank()) {
                // nginx proxies the same context-path prefix, e.g. /post-sales/* → post-sales-api
                gwUrl = gatewayUrl + contextPath + "/actuator/health";
                gwStatus = probeHealth(gwUrl);
            } else {
                gwStatus = "NOT_CONFIGURED";
            }

            results.add(new GatewayHealthDto(
                    svc.getId(), svc.getName(), directUrl, gwUrl,
                    directStatus, gwStatus, buildDiagnosis(directStatus, gwStatus)));
        }

        return results;
    }

    // "/post-sales/v3/api-docs"  → "/post-sales"
    // "/v3/api-docs"             → ""   (no context-path)
    private String contextPathFrom(String specPath) {
        if (specPath == null) return "";
        int idx = specPath.lastIndexOf("/v3/api-docs");
        if (idx <= 0) return "";
        return specPath.substring(0, idx);
    }

    private String probeHealth(String url) {
        try {
            String body = RestClient.create().get()
                    .uri(url)
                    .retrieve()
                    .body(String.class);
            return (body != null && body.contains("\"status\":\"UP\"")) ? "UP" : "UNKNOWN";
        } catch (Exception e) {
            log.debug("Health probe failed for {}: {}", url, e.getMessage());
            return "DOWN";
        }
    }

    private String buildDiagnosis(String direct, String gateway) {
        if ("NOT_CONFIGURED".equals(gateway)) {
            return "UP".equals(direct) ? "Fully healthy" : "Service is down";
        }
        if ("UP".equals(direct) && "UP".equals(gateway)) return "Fully healthy";
        if ("UP".equals(direct) && "DOWN".equals(gateway)) return "nginx routing issue: service up directly but unreachable via gateway";
        if ("DOWN".equals(direct)) return "Service is down";
        return "Status unknown";
    }

    // ── nginx config parsing ────────────────────────────────────────────────

    @Override
    public List<NginxRoute> parseNginxConfig(String configText) {
        return nginxConfigParser.parse(configText);
    }
}
