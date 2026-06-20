package io.contractsentinel.sampler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.stats.OutboundCallCounter;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.snapshot.SpecSnapshot;
import io.contractsentinel.snapshot.SpecSnapshotRepository;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.parser.OpenAPIV3Parser;
import io.swagger.v3.parser.core.models.ParseOptions;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ResponseSamplerServiceImpl implements ResponseSamplerService {

    private final SampledEndpointRepository endpointRepo;
    private final SamplingResultRepository resultRepo;
    private final ServiceRegistryRepository serviceRegistryRepo;
    private final SpecSnapshotRepository snapshotRepo;
    private final OutboundCallCounter callCounter;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    @Override
    @Transactional
    public SampledEndpointDto createEndpoint(SampledEndpointDto.SampledEndpointRequest req) {
        ServiceRegistry service = serviceRegistryRepo.findById(req.serviceId())
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + req.serviceId(), RequestContext.getRequestId()));

        SampledEndpoint endpoint = SampledEndpoint.builder()
                .service(service)
                .httpMethod(req.httpMethod() != null ? req.httpMethod() : "GET")
                .path(req.path())
                .sampleUrl(req.sampleUrl())
                .authHeader(req.authHeader())
                .tenantId(req.tenantId())
                .sampleIntervalMinutes(req.sampleIntervalMinutes() > 0 ? req.sampleIntervalMinutes() : 60)
                .build();

        return SampledEndpointDto.from(endpointRepo.save(endpoint));
    }

    @Override
    @Transactional
    public void deleteEndpoint(UUID id) {
        SampledEndpoint endpoint = endpointRepo.findById(id)
                .orElseThrow(() -> SentinelException.notFound("Sampled endpoint not found: " + id, RequestContext.getRequestId()));
        endpointRepo.delete(endpoint);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SampledEndpointDto> listEndpoints() {
        return endpointRepo.findAll().stream()
                .map(SampledEndpointDto::from)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public SamplingResultDto runSample(UUID endpointId) {
        SampledEndpoint endpoint = endpointRepo.findById(endpointId)
                .orElseThrow(() -> SentinelException.notFound("Sampled endpoint not found: " + endpointId, RequestContext.getRequestId()));

        try {
            RestClient.RequestHeadersSpec<?> requestSpec = restClient.method(
                    org.springframework.http.HttpMethod.valueOf(
                            endpoint.getHttpMethod() != null ? endpoint.getHttpMethod().toUpperCase() : "GET"))
                    .uri(endpoint.getSampleUrl());

            if (endpoint.getAuthHeader() != null && !endpoint.getAuthHeader().isBlank()) {
                requestSpec = requestSpec.header("Authorization", endpoint.getAuthHeader());
            }
            if (endpoint.getTenantId() != null && !endpoint.getTenantId().isBlank()) {
                requestSpec = requestSpec.header("x-tenant-id", endpoint.getTenantId());
            }

            callCounter.incSamplerRuns();
            String responseBody = requestSpec.retrieve().body(String.class);

            Set<String> actualFields = new LinkedHashSet<>();
            if (responseBody != null && !responseBody.isBlank()) {
                try {
                    JsonNode root = objectMapper.readTree(responseBody);
                    extractFields(root, "", actualFields, 0);
                } catch (Exception e) {
                    log.warn("Failed to parse response JSON for endpoint {}: {}", endpointId, e.getMessage());
                }
            }

            Set<String> specFields = extractSpecFields(endpoint);

            Set<String> undocumented = new LinkedHashSet<>(actualFields);
            undocumented.removeAll(specFields);

            Set<String> missing = new LinkedHashSet<>(specFields);
            missing.removeAll(actualFields);

            int matched = actualFields.size() - undocumented.size();
            int maxSize = Math.max(actualFields.size(), specFields.size());
            int matchScore = maxSize == 0 ? 100 : (int) Math.min(100, Math.max(0, (matched * 100.0 / maxSize)));

            SamplingResult result = SamplingResult.builder()
                    .endpoint(endpoint)
                    .httpStatus(200)
                    .actualFields(toJson(new ArrayList<>(actualFields)))
                    .specFields(toJson(new ArrayList<>(specFields)))
                    .undocumentedFields(toJson(new ArrayList<>(undocumented)))
                    .missingFields(toJson(new ArrayList<>(missing)))
                    .matchScore(matchScore)
                    .build();

            endpoint.setLastSampledAt(Instant.now());
            endpointRepo.save(endpoint);

            return SamplingResultDto.from(resultRepo.save(result), objectMapper);

        } catch (HttpStatusCodeException e) {
            log.warn("HTTP error sampling endpoint {}: {} {}", endpointId, e.getStatusCode(), e.getMessage());

            SamplingResult errorResult = SamplingResult.builder()
                    .endpoint(endpoint)
                    .httpStatus(e.getStatusCode().value())
                    .actualFields("[]")
                    .specFields("[]")
                    .undocumentedFields("[]")
                    .missingFields("[]")
                    .matchScore(0)
                    .build();

            endpoint.setLastSampledAt(Instant.now());
            endpointRepo.save(endpoint);

            return SamplingResultDto.from(resultRepo.save(errorResult), objectMapper);

        } catch (Exception e) {
            log.error("Unexpected error sampling endpoint {}: {}", endpointId, e.getMessage());

            SamplingResult errorResult = SamplingResult.builder()
                    .endpoint(endpoint)
                    .httpStatus(0)
                    .actualFields("[]")
                    .specFields("[]")
                    .undocumentedFields("[]")
                    .missingFields("[]")
                    .matchScore(0)
                    .build();

            endpoint.setLastSampledAt(Instant.now());
            endpointRepo.save(endpoint);

            return SamplingResultDto.from(resultRepo.save(errorResult), objectMapper);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Page<SamplingResultDto> listResults(UUID endpointId, Pageable pageable) {
        SampledEndpoint endpoint = endpointRepo.findById(endpointId)
                .orElseThrow(() -> SentinelException.notFound("Sampled endpoint not found: " + endpointId, RequestContext.getRequestId()));
        return resultRepo.findByEndpointOrderBySampledAtDesc(endpoint, pageable)
                .map(r -> SamplingResultDto.from(r, objectMapper));
    }

    @Override
    public void scheduleAll() {
        List<SampledEndpoint> endpoints = endpointRepo.findAllByEnabledTrue();
        for (SampledEndpoint endpoint : endpoints) {
            Instant now = Instant.now();
            boolean shouldSample = endpoint.getLastSampledAt() == null
                    || endpoint.getLastSampledAt()
                            .plusSeconds(endpoint.getSampleIntervalMinutes() * 60L)
                            .isBefore(now);
            if (shouldSample) {
                try {
                    runSample(endpoint.getId());
                } catch (Exception e) {
                    log.warn("Failed to run scheduled sample for endpoint {}: {}", endpoint.getId(), e.getMessage());
                }
            }
        }
    }

    private void extractFields(JsonNode node, String prefix, Set<String> fields, int depth) {
        if (depth >= 3) return;
        if (node == null) return;

        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = node.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> entry = it.next();
                String fieldPath = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
                fields.add(fieldPath);
                extractFields(entry.getValue(), fieldPath, fields, depth + 1);
            }
        } else if (node.isArray() && node.size() > 0) {
            extractFields(node.get(0), prefix + "[*]", fields, depth + 1);
        }
    }

    @SuppressWarnings("unchecked")
    private Set<String> extractSpecFields(SampledEndpoint endpoint) {
        if (endpoint.getService() == null) return Collections.emptySet();

        Optional<SpecSnapshot> latestSnapshot = snapshotRepo
                .findTopByServiceAndFetchStatusOrderByFetchedAtDesc(
                        endpoint.getService(), SpecSnapshot.FetchStatus.FETCHED);

        if (latestSnapshot.isEmpty() || latestSnapshot.get().getSpecJson() == null) {
            return Collections.emptySet();
        }

        try {
            ParseOptions opts = new ParseOptions();
            opts.setResolve(true);
            OpenAPI openAPI = new OpenAPIV3Parser()
                    .readContents(latestSnapshot.get().getSpecJson(), null, opts)
                    .getOpenAPI();

            if (openAPI == null || openAPI.getPaths() == null) return Collections.emptySet();

            String targetPath = endpoint.getPath();
            String targetMethod = endpoint.getHttpMethod() != null ? endpoint.getHttpMethod().toUpperCase() : "GET";

            io.swagger.v3.oas.models.Operation operation = openAPI.getPaths().entrySet().stream()
                    .filter(e -> pathMatches(e.getKey(), targetPath))
                    .findFirst()
                    .map(e -> e.getValue().readOperationsMap().get(
                            io.swagger.v3.oas.models.PathItem.HttpMethod.valueOf(targetMethod)))
                    .orElse(null);

            if (operation == null || operation.getResponses() == null) return Collections.emptySet();

            ApiResponse response = operation.getResponses().get("200");
            if (response == null) response = operation.getResponses().get("201");
            if (response == null || response.getContent() == null) return Collections.emptySet();

            var mediaType = response.getContent().get("application/json");
            if (mediaType == null || mediaType.getSchema() == null) return Collections.emptySet();

            Schema<?> schema = mediaType.getSchema();
            if (schema.getProperties() == null) return Collections.emptySet();

            return new LinkedHashSet<>(schema.getProperties().keySet());

        } catch (Exception e) {
            log.warn("Failed to extract spec fields for endpoint {}: {}", endpoint.getId(), e.getMessage());
            return Collections.emptySet();
        }
    }

    private boolean pathMatches(String specPath, String requestPath) {
        if (specPath == null || requestPath == null) return false;
        if (specPath.equals(requestPath)) return true;
        // Convert OpenAPI path params {id} to regex and match
        String regex = specPath.replaceAll("\\{[^}]+}", "[^/]+");
        return requestPath.matches(regex);
    }

    private String toJson(List<String> list) {
        try {
            return objectMapper.writeValueAsString(list);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }
}
