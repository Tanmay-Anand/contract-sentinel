package io.contractsentinel.catalogue;

import tools.jackson.databind.ObjectMapper;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import io.contractsentinel.snapshot.SpecSnapshot;
import io.contractsentinel.snapshot.SpecSnapshotRepository;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.parser.OpenAPIV3Parser;
import io.swagger.v3.parser.core.models.ParseOptions;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class ApiCatalogueServiceImpl implements ApiCatalogueService {

    private final ServiceRegistryRepository serviceRegistryRepository;
    private final SpecSnapshotRepository snapshotRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    @Transactional(readOnly = true)
    public List<CatalogueEntryDto> search(String query, UUID serviceId, String method) {
        List<ServiceRegistry> services;
        if (serviceId != null) {
            services = serviceRegistryRepository.findById(serviceId)
                    .map(List::of)
                    .orElse(Collections.emptyList());
        } else {
            services = serviceRegistryRepository.findAllByActiveTrue();
        }

        List<CatalogueEntryDto> results = new ArrayList<>();

        for (ServiceRegistry svc : services) {
            try {
                Optional<SpecSnapshot> snapshotOpt = snapshotRepository
                        .findTopByServiceAndFetchStatusOrderByFetchedAtDesc(svc, SpecSnapshot.FetchStatus.FETCHED);
                if (snapshotOpt.isEmpty()) {
                    log.debug("No FETCHED snapshot for service {}, skipping", svc.getName());
                    continue;
                }

                String specJson = snapshotOpt.get().getSpecJson();
                if (specJson == null || specJson.isBlank()) {
                    continue;
                }

                ParseOptions parseOptions = new ParseOptions();
                parseOptions.setResolve(true);
                OpenAPI api = new OpenAPIV3Parser().readContents(specJson, null, parseOptions).getOpenAPI();

                if (api == null || api.getPaths() == null) {
                    log.warn("Could not parse OpenAPI spec for service {}", svc.getName());
                    continue;
                }

                api.getPaths().forEach((path, pathItem) ->
                        pathItem.readOperationsMap().forEach((httpMethod, operation) -> {
                            CatalogueEntryDto entry = buildEntry(svc, path, httpMethod.name(), operation);
                            results.add(entry);
                        }));

            } catch (Exception e) {
                log.error("Error processing catalogue for service {}: {}", svc.getName(), e.getMessage(), e);
            }
        }

        // Apply filters
        String lowerQuery = (query != null && !query.isBlank()) ? query.toLowerCase() : null;
        String lowerMethod = (method != null && !method.isBlank()) ? method.toLowerCase() : null;

        return results.stream()
                .filter(entry -> lowerQuery == null || matchesQuery(entry, lowerQuery))
                .filter(entry -> lowerMethod == null || entry.httpMethod().equalsIgnoreCase(method))
                .sorted(Comparator.comparing(CatalogueEntryDto::serviceName)
                        .thenComparing(CatalogueEntryDto::path))
                .collect(Collectors.toList());
    }

    private boolean matchesQuery(CatalogueEntryDto entry, String lowerQuery) {
        if (entry.path() != null && entry.path().toLowerCase().contains(lowerQuery)) return true;
        if (entry.summary() != null && entry.summary().toLowerCase().contains(lowerQuery)) return true;
        if (entry.operationId() != null && entry.operationId().toLowerCase().contains(lowerQuery)) return true;
        if (entry.tags() != null && entry.tags().stream().anyMatch(t -> t.toLowerCase().contains(lowerQuery))) return true;
        if (entry.requestFields() != null && entry.requestFields().stream()
                .anyMatch(f -> f.name().toLowerCase().contains(lowerQuery))) return true;
        if (entry.responseFields() != null && entry.responseFields().stream()
                .anyMatch(f -> f.name().toLowerCase().contains(lowerQuery))) return true;
        return false;
    }

    private CatalogueEntryDto buildEntry(ServiceRegistry svc, String path, String httpMethod, Operation operation) {
        List<ParameterInfo> parameters = extractParameters(operation);
        List<FieldInfo> requestFields = extractRequestFields(operation);
        List<FieldInfo> responseFields = extractResponseFields(operation);

        List<String> tags = operation.getTags() != null ? operation.getTags() : Collections.emptyList();

        return new CatalogueEntryDto(
                svc.getId(),
                svc.getName(),
                httpMethod,
                path,
                operation.getSummary(),
                operation.getOperationId(),
                tags,
                parameters,
                requestFields,
                responseFields
        );
    }

    private List<ParameterInfo> extractParameters(Operation operation) {
        if (operation.getParameters() == null) return Collections.emptyList();
        return operation.getParameters().stream()
                .map(p -> new ParameterInfo(
                        p.getName(),
                        p.getIn(),
                        Boolean.TRUE.equals(p.getRequired()),
                        resolveSchemaType(p.getSchema()),
                        p.getDescription()
                ))
                .collect(Collectors.toList());
    }

    @SuppressWarnings("unchecked")
    private List<FieldInfo> extractRequestFields(Operation operation) {
        if (operation.getRequestBody() == null) return Collections.emptyList();
        var content = operation.getRequestBody().getContent();
        if (content == null) return Collections.emptyList();
        var mediaType = content.get("application/json");
        if (mediaType == null || mediaType.getSchema() == null) return Collections.emptyList();

        Schema<?> schema = mediaType.getSchema();
        List<String> required = schema.getRequired() != null ? schema.getRequired() : Collections.emptyList();
        return buildFieldInfoList(schema, required);
    }

    @SuppressWarnings("unchecked")
    private List<FieldInfo> extractResponseFields(Operation operation) {
        if (operation.getResponses() == null) return Collections.emptyList();

        ApiResponse response = operation.getResponses().get("200");
        if (response == null) response = operation.getResponses().get("201");
        if (response == null || response.getContent() == null) return Collections.emptyList();

        var mediaType = response.getContent().get("application/json");
        if (mediaType == null || mediaType.getSchema() == null) return Collections.emptyList();

        Schema<?> schema = mediaType.getSchema();
        List<String> required = schema.getRequired() != null ? schema.getRequired() : Collections.emptyList();
        return buildFieldInfoList(schema, required);
    }

    @SuppressWarnings("unchecked")
    private List<FieldInfo> buildFieldInfoList(Schema<?> schema, List<String> required) {
        if (schema.getProperties() == null) return Collections.emptyList();
        return schema.getProperties().entrySet().stream()
                .map(e -> {
                    String fieldName = (String) e.getKey();
                    Schema<?> fieldSchema = (Schema<?>) e.getValue();
                    return new FieldInfo(
                            fieldName,
                            resolveSchemaType(fieldSchema),
                            required.contains(fieldName),
                            fieldSchema.getDescription()
                    );
                })
                .collect(Collectors.toList());
    }

    private String resolveSchemaType(Schema<?> schema) {
        if (schema == null) return null;
        if (schema.getType() != null) return schema.getType();
        if (schema.get$ref() != null) {
            // Extract type name from $ref, e.g. "#/components/schemas/Foo" -> "Foo"
            String ref = schema.get$ref();
            int lastSlash = ref.lastIndexOf('/');
            return lastSlash >= 0 ? ref.substring(lastSlash + 1) : ref;
        }
        return null;
    }
}
