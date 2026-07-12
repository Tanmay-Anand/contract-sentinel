package io.contractsentinel.knowledge;

import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.graph.SharedDbSchemaService;
import io.contractsentinel.llm.LlmClient;
import io.contractsentinel.llm.LlmMessage;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class KnowledgeServiceImpl implements KnowledgeService {

    private final GraphSynonymRepository synonymRepo;
    private final GraphMetricRepository metricRepo;
    private final LlmClient llmClient;
    private final SharedDbSchemaService schemaService;
    private final ServiceRegistryRepository serviceRepo;
    private final ObjectMapper objectMapper;

    // â”€â”€ Synonyms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @Override
    public List<SynonymDto> listSynonyms(Boolean approvedOnly, String serviceName) {
        List<GraphSynonym> all;
        if (serviceName != null && !serviceName.isBlank()) {
            all = Boolean.TRUE.equals(approvedOnly)
                    ? synonymRepo.findAllByServiceNameAndApprovedAtIsNotNull(serviceName)
                    : Boolean.FALSE.equals(approvedOnly)
                      ? synonymRepo.findAllByServiceNameAndApprovedAtIsNull(serviceName)
                      : synonymRepo.findAllByServiceName(serviceName);
        } else {
            all = Boolean.TRUE.equals(approvedOnly)
                    ? synonymRepo.findAllByApprovedAtIsNotNull()
                    : Boolean.FALSE.equals(approvedOnly)
                      ? synonymRepo.findAllByApprovedAtIsNull()
                      : synonymRepo.findAll();
        }
        return all.stream().map(SynonymDto::from).toList();
    }

    @Override
    @Transactional
    public SynonymDto createSynonym(CreateSynonymRequest req) {
        GraphSynonym synonym = GraphSynonym.builder()
                .term(req.term().toLowerCase().trim())
                .targetType(req.targetType())
                .targetName(req.targetName())
                .serviceName(req.serviceName())
                .proposedByLlm(false)
                .createdAt(Instant.now())
                .approvedAt(Instant.now())
                .build();
        return SynonymDto.from(synonymRepo.save(synonym));
    }

    @Override
    @Transactional
    public SynonymDto approveSynonym(UUID id) {
        GraphSynonym s = synonymRepo.findById(id)
                .orElseThrow(() -> new SentinelException("Synonym not found: " + id, HttpStatus.NOT_FOUND, null));
        s.setApprovedAt(Instant.now());
        return SynonymDto.from(synonymRepo.save(s));
    }

    @Override
    @Transactional
    public void deleteSynonym(UUID id) {
        if (!synonymRepo.existsById(id)) {
            throw new SentinelException("Synonym not found: " + id, HttpStatus.NOT_FOUND, null);
        }
        synonymRepo.deleteById(id);
    }

    @Override
    @Transactional
    public List<SynonymDto> proposeSynonymsFromSchema(UUID serviceId) {
        ServiceRegistry service = serviceRepo.findById(serviceId)
                .orElseThrow(() -> new SentinelException("Service not found: " + serviceId, HttpStatus.NOT_FOUND, null));

        List<SharedDbSchemaService.DbSchemaGroupDto> schema;
        try {
            schema = schemaService.getDbGraph();
        } catch (Exception e) {
            throw new SentinelException("Could not read schema: " + e.getMessage(), HttpStatus.BAD_GATEWAY, null);
        }

        String tableList = schema.stream()
                .flatMap(g -> g.tables().stream()
                        .map(t -> g.serviceGroupName() + "." + t.tableName()
                                + " [" + t.columns().stream()
                                .map(SharedDbSchemaService.ColumnDto::name)
                                .collect(Collectors.joining(", ")) + "]"))
                .collect(Collectors.joining("\n"));

        String systemPrompt = """
                You are a database schema analyst for a construction/real estate CRM.
                Suggest natural-language synonyms developers might use when querying this schema.
                Rules:
                - Focus on TABLE synonyms (most impactful); include important COLUMN synonyms too
                - Only suggest terms with clear semantic meaning in the domain
                - Do not duplicate terms that already match the table/column name exactly
                Respond with ONLY a valid JSON array. No prose, no markdown fences.
                Format: [{"term":"sale","targetType":"TABLE","targetName":"booking","serviceName":"crm-post-sales-api"}]
                """;

        String userPrompt = "Schema:\n" + tableList + "\n\nSuggest 15-25 synonyms. Return only the JSON array.";
        String responseText = callLlm(systemPrompt, userPrompt, "synonym proposal");

        List<JsonNode> proposals = extractJsonArray(responseText);
        List<GraphSynonym> saved = new ArrayList<>();
        for (JsonNode node : proposals) {
            String term = textOr(node, "term", null);
            String targetName = textOr(node, "targetName", null);
            String targetTypeStr = textOr(node, "targetType", null);
            if (term == null || targetName == null || targetTypeStr == null) continue;
            term = term.toLowerCase().trim();
            if (synonymRepo.existsByTermIgnoreCaseAndTargetName(term, targetName)) continue;
            try {
                GraphSynonym.TargetType type = GraphSynonym.TargetType.valueOf(targetTypeStr.toUpperCase());
                String svcName = textOr(node, "serviceName", service.getName());
                saved.add(synonymRepo.save(GraphSynonym.builder()
                        .term(term)
                        .targetType(type)
                        .targetName(targetName)
                        .serviceName(svcName)
                        .proposedByLlm(true)
                        .createdAt(Instant.now())
                        .approvedAt(null)
                        .build()));
            } catch (IllegalArgumentException e) {
                log.warn("Skipping synonym with unknown targetType: {}", targetTypeStr);
            }
        }
        log.info("LLM proposed {} synonyms for {}, {} new", proposals.size(), service.getName(), saved.size());
        return saved.stream().map(SynonymDto::from).toList();
    }

    // â”€â”€ Metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @Override
    public List<MetricDto> listMetrics(Boolean approvedOnly, String serviceName) {
        List<GraphMetric> all;
        if (serviceName != null && !serviceName.isBlank()) {
            all = Boolean.TRUE.equals(approvedOnly)
                    ? metricRepo.findAllByServiceNameAndApprovedAtIsNotNull(serviceName)
                    : Boolean.FALSE.equals(approvedOnly)
                      ? metricRepo.findAllByServiceNameAndApprovedAtIsNull(serviceName)
                      : metricRepo.findAllByServiceName(serviceName);
        } else {
            all = Boolean.TRUE.equals(approvedOnly)
                    ? metricRepo.findAllByApprovedAtIsNotNull()
                    : Boolean.FALSE.equals(approvedOnly)
                      ? metricRepo.findAllByApprovedAtIsNull()
                      : metricRepo.findAll();
        }
        return all.stream().map(MetricDto::from).toList();
    }

    @Override
    @Transactional
    public MetricDto createMetric(CreateMetricRequest req) {
        if (metricRepo.existsByNameIgnoreCase(req.name())) {
            throw new SentinelException("Metric '" + req.name() + "' already exists", HttpStatus.CONFLICT, null);
        }
        GraphMetric metric = GraphMetric.builder()
                .name(req.name())
                .displayName(req.displayName())
                .description(req.description())
                .sqlDefinition(req.sqlDefinition())
                .anchorTable(req.anchorTable())
                .serviceName(req.serviceName())
                .aggregationFunction(req.aggregationFunction())
                .proposedByLlm(false)
                .createdAt(Instant.now())
                .approvedAt(Instant.now())
                .build();
        return MetricDto.from(metricRepo.save(metric));
    }

    @Override
    @Transactional
    public MetricDto approveMetric(UUID id) {
        GraphMetric m = metricRepo.findById(id)
                .orElseThrow(() -> new SentinelException("Metric not found: " + id, HttpStatus.NOT_FOUND, null));
        m.setApprovedAt(Instant.now());
        return MetricDto.from(metricRepo.save(m));
    }

    @Override
    @Transactional
    public void deleteMetric(UUID id) {
        if (!metricRepo.existsById(id)) {
            throw new SentinelException("Metric not found: " + id, HttpStatus.NOT_FOUND, null);
        }
        metricRepo.deleteById(id);
    }

    @Override
    @Transactional
    public List<MetricDto> proposeMetricsFromSchema(UUID serviceId) {
        ServiceRegistry service = serviceRepo.findById(serviceId)
                .orElseThrow(() -> new SentinelException("Service not found: " + serviceId, HttpStatus.NOT_FOUND, null));

        List<SharedDbSchemaService.DbSchemaGroupDto> schema;
        try {
            schema = schemaService.getDbGraph();
        } catch (Exception e) {
            throw new SentinelException("Could not read schema: " + e.getMessage(), HttpStatus.BAD_GATEWAY, null);
        }

        StringBuilder sb = new StringBuilder();
        for (var group : schema) {
            sb.append("Service: ").append(group.serviceGroupName()).append("\n");
            for (var table : group.tables()) {
                sb.append("  Table: ").append(table.tableName())
                  .append(" (")
                  .append(table.columns().stream().map(SharedDbSchemaService.ColumnDto::name).collect(Collectors.joining(", ")))
                  .append(")\n");
            }
            for (var fk : group.foreignKeys()) {
                sb.append("  FK: ").append(fk.fromTable()).append(".").append(fk.fromColumn())
                  .append(" â†’ ").append(fk.toTable()).append(".").append(fk.toColumn()).append("\n");
            }
        }

        String systemPrompt = """
                You are a BI analyst for a construction/real estate CRM.
                Suggest useful pre-defined business metrics based on the database schema.
                Rules:
                - Each metric must answer a real business question developers would ask
                - SQL must be a valid SELECT statement; use schema prefix where needed
                - aggregationFunction must be one of: COUNT, SUM, AVG, MIN, MAX, CUSTOM
                Respond with ONLY a valid JSON array. No prose, no markdown fences.
                Format: [{"name":"BookingCount","displayName":"Confirmed Booking Count","description":"Total confirmed bookings",
                "sqlDefinition":"SELECT COUNT(*) FROM booking WHERE status = 'CONFIRMED'",
                "anchorTable":"booking","serviceName":"crm-post-sales-api","aggregationFunction":"COUNT"}]
                """;

        String userPrompt = "Schema:\n" + sb + "\n\nSuggest 10-15 business metrics. Return only the JSON array.";
        String responseText = callLlm(systemPrompt, userPrompt, "metric proposal");

        List<JsonNode> proposals = extractJsonArray(responseText);
        List<GraphMetric> saved = new ArrayList<>();
        for (JsonNode node : proposals) {
            String name = textOr(node, "name", null);
            String sqlDef = textOr(node, "sqlDefinition", null);
            String anchorTable = textOr(node, "anchorTable", null);
            if (name == null || sqlDef == null || anchorTable == null) continue;
            if (metricRepo.existsByNameIgnoreCase(name)) continue;
            try {
                String fnStr = textOr(node, "aggregationFunction", "CUSTOM");
                GraphMetric.AggregationFunction fn = GraphMetric.AggregationFunction.valueOf(fnStr.toUpperCase());
                saved.add(metricRepo.save(GraphMetric.builder()
                        .name(name)
                        .displayName(textOr(node, "displayName", name))
                        .description(textOr(node, "description", null))
                        .sqlDefinition(sqlDef)
                        .anchorTable(anchorTable)
                        .serviceName(textOr(node, "serviceName", service.getName()))
                        .aggregationFunction(fn)
                        .proposedByLlm(true)
                        .createdAt(Instant.now())
                        .approvedAt(null)
                        .build()));
            } catch (IllegalArgumentException e) {
                log.warn("Skipping metric with unknown aggregationFunction: {}", textOr(node, "aggregationFunction", "?"));
            }
        }
        log.info("LLM proposed {} metrics for {}, {} new", proposals.size(), service.getName(), saved.size());
        return saved.stream().map(MetricDto::from).toList();
    }

    // â”€â”€ Service graph â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @Override
    public List<ServiceKnowledgeSummaryDto> getServiceGraph() {
        return serviceRepo.findAllByActiveTrue().stream()
                .map(svc -> new ServiceKnowledgeSummaryDto(
                        svc.getName(),
                        synonymRepo.countByServiceNameAndApprovedAtIsNotNull(svc.getName()),
                        synonymRepo.countByServiceNameAndApprovedAtIsNull(svc.getName()),
                        metricRepo.countByServiceNameAndApprovedAtIsNotNull(svc.getName()),
                        metricRepo.countByServiceNameAndApprovedAtIsNull(svc.getName())
                ))
                .toList();
    }

    // â”€â”€ Term resolution (used by Phase 2 IR pipeline) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @Override
    public ResolveTermsResponse resolveTerms(String text) {
        if (text == null || text.isBlank()) {
            return new ResolveTermsResponse(text, List.of());
        }
        String lower = text.toLowerCase();
        List<ResolveTermsResponse.ResolvedTerm> resolved = synonymRepo.findAllByApprovedAtIsNotNull()
                .stream()
                .filter(s -> lower.contains(s.getTerm()))
                .map(s -> new ResolveTermsResponse.ResolvedTerm(
                        s.getTerm(), s.getTargetType(), s.getTargetName(), s.getServiceName()))
                .toList();
        return new ResolveTermsResponse(text, resolved);
    }

    // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private String callLlm(String system, String user, String context) {
        try {
            return llmClient.chat(
                    List.of(LlmMessage.system(system), LlmMessage.user(user)),
                    List.of()
            ).content();
        } catch (Exception e) {
            throw new SentinelException("LLM call failed during " + context + ": " + e.getMessage(),
                    HttpStatus.BAD_GATEWAY, null);
        }
    }

    private List<JsonNode> extractJsonArray(String text) {
        if (text == null || text.isBlank()) return List.of();
        int start = text.indexOf('[');
        int end = text.lastIndexOf(']');
        if (start < 0 || end <= start) {
            log.warn("LLM response contained no JSON array");
            return List.of();
        }
        try {
            JsonNode arr = objectMapper.readTree(text.substring(start, end + 1));
            if (!arr.isArray()) return List.of();
            List<JsonNode> result = new ArrayList<>();
            arr.forEach(result::add);
            return result;
        } catch (Exception e) {
            log.warn("Failed to parse LLM JSON array: {}", e.getMessage());
            return List.of();
        }
    }

    private String textOr(JsonNode node, String field, String fallback) {
        JsonNode n = node.get(field);
        return (n != null && n.isTextual()) ? n.asText() : fallback;
    }
}
