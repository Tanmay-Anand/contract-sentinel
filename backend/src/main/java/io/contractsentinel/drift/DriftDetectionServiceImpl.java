package io.contractsentinel.drift;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.alert.AlertService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.snapshot.SpecSnapshot;
import io.contractsentinel.ws.WebSocketEventPublisher;
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

import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class DriftDetectionServiceImpl implements DriftDetectionService {

    private final DriftEventRepository driftEventRepository;
    private final AlertService alertService;
    private final WebSocketEventPublisher eventPublisher;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void detectAndPersist(ServiceRegistry service, SpecSnapshot prev, SpecSnapshot curr) {
        if (prev == null || curr == null) return;
        if (prev.getSpecJson() == null || curr.getSpecJson() == null) return;

        OpenAPI prevApi = parse(prev.getSpecJson());
        OpenAPI currApi = parse(curr.getSpecJson());

        if (prevApi == null || currApi == null) {
            log.warn("Could not parse specs for service {}, skipping diff", service.getName());
            return;
        }

        List<DriftEvent> events = diff(service, prev, curr, prevApi, currApi);

        // Deduplicate: skip any event whose (service, changeType, httpMethod, apiPath, fieldPath)
        // combination already exists. fieldPath is part of the key so a SECOND field removed on
        // the same endpoint is a new finding, not a duplicate of the first — without it, the
        // oldest-baseline diff correctly detects the change but dedup silently discards it.
        List<DriftEvent> newEvents = events.stream()
                .filter(e -> !driftEventRepository.existsByServiceAndChangeTypeAndHttpMethodAndApiPathAndFieldPath(
                        e.getService(), e.getChangeType(), e.getHttpMethod(), e.getApiPath(), e.getFieldPath()))
                .toList();

        if (!newEvents.isEmpty()) {
            driftEventRepository.saveAll(newEvents);
            log.info("Detected {} new drift event(s) for {} ({} duplicates suppressed)",
                    newEvents.size(), service.getName(), events.size() - newEvents.size());
            newEvents.forEach(e -> eventPublisher.publish("drift.detected", DriftEventDto.from(e)));
            newEvents.stream()
                    .filter(e -> e.getSeverity() == DriftEvent.Severity.BREAKING)
                    .forEach(e -> alertService.evaluateBreaking(
                            service.getId(), service.getName(),
                            e.getChangeType().name(), e.getApiPath()));
        }
    }

    private OpenAPI parse(String specJson) {
        try {
            ParseOptions opts = new ParseOptions();
            opts.setResolve(true);
            var result = new OpenAPIV3Parser().readContents(specJson, null, opts);
            if (result.getOpenAPI() == null) {
                log.warn("swagger-parser returned null OpenAPI; messages: {}", result.getMessages());
            }
            return result.getOpenAPI();
        } catch (Exception e) {
            log.error("Failed to parse OpenAPI spec", e);
            return null;
        }
    }

    private List<DriftEvent> diff(ServiceRegistry service, SpecSnapshot prev, SpecSnapshot curr,
                                   OpenAPI prevApi, OpenAPI currApi) {
        List<DriftEvent> events = new ArrayList<>();

        Map<String, Operation> prevOps = extractOperations(prevApi);
        Map<String, Operation> currOps = extractOperations(currApi);

        for (Map.Entry<String, Operation> entry : prevOps.entrySet()) {
            if (!currOps.containsKey(entry.getKey())) {
                String[] parts = entry.getKey().split(":", 2);
                events.add(buildEvent(service, prev, curr,
                        DriftEvent.ChangeType.PATH_REMOVED, DriftEvent.Severity.BREAKING,
                        parts[0], parts[1], null, Map.of("removed", entry.getKey())));
            }
        }

        for (String key : currOps.keySet()) {
            if (!prevOps.containsKey(key)) {
                String[] parts = key.split(":", 2);
                events.add(buildEvent(service, prev, curr,
                        DriftEvent.ChangeType.PATH_ADDED, DriftEvent.Severity.SAFE,
                        parts[0], parts[1], null, Map.of("added", key)));
            }
        }

        for (String key : prevOps.keySet()) {
            if (currOps.containsKey(key)) {
                String[] parts = key.split(":", 2);
                events.addAll(diffSchemas(service, prev, curr,
                        parts[0], parts[1],
                        prevOps.get(key), currOps.get(key)));
            }
        }

        return events;
    }

    private Map<String, Operation> extractOperations(OpenAPI api) {
        Map<String, Operation> ops = new LinkedHashMap<>();
        if (api == null || api.getPaths() == null) return ops;
        api.getPaths().forEach((path, pathItem) ->
                pathItem.readOperationsMap().forEach((method, op) ->
                        ops.put(method.name() + ":" + path, op)));
        return ops;
    }

    @SuppressWarnings("unchecked")
    private List<DriftEvent> diffSchemas(ServiceRegistry service, SpecSnapshot prev, SpecSnapshot curr,
                                          String method, String path,
                                          Operation prevOp, Operation currOp) {
        List<DriftEvent> events = new ArrayList<>();

        Set<String> prevFields = extractResponseFields(prevOp);
        Set<String> currFields = extractResponseFields(currOp);
        Map<String, String> prevTypes = extractFieldTypes(prevOp);
        Map<String, String> currTypes = extractFieldTypes(currOp);

        for (String field : prevFields) {
            if (!currFields.contains(field)) {
                events.add(buildEvent(service, prev, curr,
                        DriftEvent.ChangeType.RESPONSE_FIELD_REMOVED, DriftEvent.Severity.BREAKING,
                        method, path, field, Map.of("field", field, "previousType", prevTypes.getOrDefault(field, "unknown"))));
            }
        }

        for (String field : currFields) {
            if (!prevFields.contains(field)) {
                events.add(buildEvent(service, prev, curr,
                        DriftEvent.ChangeType.RESPONSE_FIELD_ADDED, DriftEvent.Severity.SAFE,
                        method, path, field, Map.of("field", field, "newType", currTypes.getOrDefault(field, "unknown"))));
            }
        }

        for (String field : prevFields) {
            if (currFields.contains(field)) {
                String prevType = prevTypes.getOrDefault(field, "");
                String currType = currTypes.getOrDefault(field, "");
                if (!prevType.isEmpty() && !currType.isEmpty() && !prevType.equals(currType)) {
                    events.add(buildEvent(service, prev, curr,
                            DriftEvent.ChangeType.RESPONSE_FIELD_TYPE_CHANGED, DriftEvent.Severity.BREAKING,
                            method, path, field, Map.of("field", field, "oldType", prevType, "newType", currType)));
                }
            }
        }

        Set<String> prevRequired = extractRequiredRequestFields(prevOp);
        Set<String> currRequired = extractRequiredRequestFields(currOp);
        for (String field : currRequired) {
            if (!prevRequired.contains(field)) {
                events.add(buildEvent(service, prev, curr,
                        DriftEvent.ChangeType.REQUEST_REQUIRED_FIELD_ADDED, DriftEvent.Severity.BREAKING,
                        method, path, field, Map.of("requiredField", field)));
            }
        }

        events.addAll(diffParameters(service, prev, curr, method, path, prevOp, currOp));

        return events;
    }

    private List<DriftEvent> diffParameters(ServiceRegistry service, SpecSnapshot prev, SpecSnapshot curr,
                                             String method, String path,
                                             Operation prevOp, Operation currOp) {
        List<DriftEvent> events = new ArrayList<>();
        Map<String, Parameter> prevParams = indexParams(prevOp);
        Map<String, Parameter> currParams = indexParams(currOp);

        for (Map.Entry<String, Parameter> entry : prevParams.entrySet()) {
            String paramKey = entry.getKey();
            Parameter prevParam = entry.getValue();
            Parameter currParam = currParams.get(paramKey);

            if (currParam == null) {
                events.add(buildEvent(service, prev, curr,
                        DriftEvent.ChangeType.PARAM_REMOVED, DriftEvent.Severity.BREAKING,
                        method, path, "param:" + prevParam.getName(),
                        Map.of("param", prevParam.getName(), "in", prevParam.getIn())));
                continue;
            }

            // Check type change
            String prevType = paramType(prevParam);
            String currType = paramType(currParam);
            if (!prevType.isEmpty() && !currType.isEmpty() && !prevType.equals(currType)) {
                events.add(buildEvent(service, prev, curr,
                        DriftEvent.ChangeType.PARAM_TYPE_CHANGED, DriftEvent.Severity.BREAKING,
                        method, path, "param:" + prevParam.getName(),
                        Map.of("param", prevParam.getName(), "oldType", prevType, "newType", currType)));
            }

            // Check optional → required
            boolean wasRequired = Boolean.TRUE.equals(prevParam.getRequired());
            boolean nowRequired = Boolean.TRUE.equals(currParam.getRequired());
            if (!wasRequired && nowRequired) {
                events.add(buildEvent(service, prev, curr,
                        DriftEvent.ChangeType.PARAM_BECAME_REQUIRED, DriftEvent.Severity.BREAKING,
                        method, path, "param:" + prevParam.getName(),
                        Map.of("param", prevParam.getName(), "in", prevParam.getIn())));
            }
        }
        return events;
    }

    private static Map<String, Parameter> indexParams(Operation op) {
        if (op == null || op.getParameters() == null) return Map.of();
        Map<String, Parameter> index = new LinkedHashMap<>();
        for (Parameter p : op.getParameters()) {
            if (p.getName() != null && p.getIn() != null) {
                index.put(p.getIn() + ":" + p.getName(), p);
            }
        }
        return index;
    }

    private static String paramType(Parameter p) {
        if (p.getSchema() == null) return "";
        String type = p.getSchema().getType();
        return type != null ? type : "";
    }

    @SuppressWarnings("unchecked")
    private Set<String> extractResponseFields(Operation op) {
        Schema<?> schema = resolveResponseSchema(op);
        if (schema == null || schema.getProperties() == null) return Set.of();
        return schema.getProperties().keySet();
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> extractFieldTypes(Operation op) {
        Schema<?> schema = resolveResponseSchema(op);
        if (schema == null || schema.getProperties() == null) return Map.of();
        Map<String, String> types = new HashMap<>();
        schema.getProperties().forEach((field, s) -> {
            if (s instanceof Schema<?> fieldSchema && fieldSchema.getType() != null) {
                types.put((String) field, fieldSchema.getType());
            }
        });
        return types;
    }

    private Schema<?> resolveResponseSchema(Operation op) {
        if (op == null || op.getResponses() == null) return null;
        ApiResponse response = op.getResponses().get("200");
        if (response == null) response = op.getResponses().get("201");
        if (response == null || response.getContent() == null) return null;
        var mediaType = response.getContent().get("application/json");
        if (mediaType == null) return null;
        return mediaType.getSchema();
    }

    @SuppressWarnings("unchecked")
    private Set<String> extractRequiredRequestFields(Operation op) {
        if (op == null || op.getRequestBody() == null) return Set.of();
        var content = op.getRequestBody().getContent();
        if (content == null) return Set.of();
        var mediaType = content.get("application/json");
        if (mediaType == null || mediaType.getSchema() == null) return Set.of();
        List<String> required = mediaType.getSchema().getRequired();
        return required != null ? new HashSet<>(required) : Set.of();
    }

    private DriftEvent buildEvent(ServiceRegistry service, SpecSnapshot prev, SpecSnapshot curr,
                                   DriftEvent.ChangeType changeType, DriftEvent.Severity severity,
                                   String method, String path, String fieldPath, Map<String, Object> detail) {
        String detailJson;
        try {
            detailJson = objectMapper.writeValueAsString(detail);
        } catch (Exception e) {
            detailJson = "{}";
        }
        return DriftEvent.builder()
                .service(service)
                .fromSnapshot(prev)
                .toSnapshot(curr)
                .changeType(changeType)
                .severity(severity)
                .httpMethod(method)
                .apiPath(path)
                .fieldPath(fieldPath)
                .detail(detailJson)
                .build();
    }
}
