package io.contractsentinel.query;

import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.graph.SharedDbSchemaService;
import io.contractsentinel.knowledge.KnowledgeService;
import io.contractsentinel.knowledge.ResolveTermsResponse;
import io.contractsentinel.llm.LlmClient;
import io.contractsentinel.llm.LlmMessage;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class NlQueryServiceImpl implements NlQueryService {

    private static final int MAX_IR_ATTEMPTS = 3;

    private final LlmClient llmClient;
    private final KnowledgeService knowledgeService;
    private final SemanticQueryValidator validator;
    private final IrToSqlCompiler compiler;
    private final DbQueryService dbQueryService;
    private final SharedDbSchemaService schemaService;
    private final ServiceRegistryRepository serviceRepo;
    private final ObjectMapper objectMapper;

    @Override
    public NlQueryResponse query(UUID serviceId, String question) {
        long t0 = System.currentTimeMillis();

        ServiceRegistry service = serviceRepo.findById(serviceId)
                .orElseThrow(() -> new SentinelException("Service not found: " + serviceId, HttpStatus.NOT_FOUND, null));

        // 1. Resolve synonym hints from the question
        ResolveTermsResponse resolved = knowledgeService.resolveTerms(question);
        List<String> synonymsApplied = resolved.resolvedTerms().stream()
                .map(t -> t.term() + "â†’" + t.targetName())
                .collect(Collectors.toList());

        // 2. Build schema context for the prompt
        String schemaContext = buildSchemaContext(service.getName());

        // 3. Build synonym hint for the prompt
        String synonymHint = resolved.resolvedTerms().isEmpty() ? ""
                : "Synonym hints (already resolved for you):\n" + resolved.resolvedTerms().stream()
                .map(t -> "  \"" + t.term() + "\" â†’ table/column \"" + t.targetName() + "\"")
                .collect(Collectors.joining("\n")) + "\n\n";

        String systemPrompt = buildSystemPrompt(schemaContext, service.getName());

        // 4. LLM fills the IR â€” retry loop on validation failure (max 3)
        SemanticQueryIR ir = null;
        int attempts = 0;
        List<LlmMessage> messages = new ArrayList<>();
        messages.add(LlmMessage.system(systemPrompt));
        messages.add(LlmMessage.user(synonymHint + "Question: " + question));

        for (int i = 0; i < MAX_IR_ATTEMPTS; i++) {
            attempts++;
            String responseText;
            try {
                responseText = llmClient.chat(messages, List.of()).content();
            } catch (Exception e) {
                throw new SentinelException("LLM call failed: " + e.getMessage(), HttpStatus.BAD_GATEWAY, null);
            }

            SemanticQueryIR candidate = parseIr(responseText);
            if (candidate == null) {
                String errorMsg = "Could not parse JSON from your response. Return only a JSON object matching the IR schema.";
                messages.add(LlmMessage.assistant(responseText, List.of()));
                messages.add(LlmMessage.user(errorMsg));
                continue;
            }

            IrValidationResult validation = validator.validate(candidate);
            if (validation.valid()) {
                ir = candidate;
                break;
            }

            // Feed validation errors back to LLM for repair
            String errorMsg = "Validation failed: " + validation.errorSummary()
                    + ". Please correct the IR and return only the JSON object.";
            messages.add(LlmMessage.assistant(responseText, List.of()));
            messages.add(LlmMessage.user(errorMsg));
            log.debug("IR attempt {} failed validation: {}", i + 1, validation.errorSummary());
        }

        if (ir == null) {
            throw new SentinelException(
                    "Could not produce a valid query IR after " + MAX_IR_ATTEMPTS + " attempts. "
                    + "Try rephrasing your question.", HttpStatus.UNPROCESSABLE_ENTITY, null);
        }

        // 5. Compile IR to SQL
        String sql = compiler.compile(ir);
        log.info("NL query compiled to SQL: {}", sql);

        // 6. Execute
        DbQueryResponse result = dbQueryService.execute(serviceId, sql);
        long totalMs = System.currentTimeMillis() - t0;

        return new NlQueryResponse(
                question, sql, ir,
                result.columns(), result.rows(), result.rowCount(), result.executionMs(),
                totalMs, attempts, synonymsApplied
        );
    }

    // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private String buildSchemaContext(String serviceName) {
        try {
            return schemaService.getDbGraph().stream()
                    .filter(g -> g.serviceGroupName().equalsIgnoreCase(serviceName))
                    .flatMap(g -> g.tables().stream()
                            .map(t -> t.tableName() + "("
                                    + t.columns().stream().map(c -> c.name() + " " + c.type())
                                    .collect(Collectors.joining(", ")) + ")"))
                    .collect(Collectors.joining("\n"));
        } catch (Exception e) {
            return "(schema unavailable)";
        }
    }

    private String buildSystemPrompt(String schemaContext, String serviceName) {
        return """
                You are a database query assistant. Your job is to translate a natural-language question
                into a structured JSON query IR. Return ONLY the JSON object â€” no prose, no fences.

                IR schema:
                """ + SemanticQueryIR.IR_SCHEMA + """

                Rules:
                - targetTable must be an exact table name from the schema below
                - selectColumns: use ["*"] if the user wants all fields; otherwise pick relevant columns
                - filters.operator must be one of: =, !=, <, >, <=, >=, LIKE, ILIKE, IN, IS NULL, IS NOT NULL
                - orderDirection: ASC or DESC
                - limitCount: default 50 if not specified, max 500
                - metricName: only set if the question clearly maps to a pre-defined metric
                - serviceName must be: """ + serviceName + """

                Database schema:
                """ + schemaContext;
    }

    private SemanticQueryIR parseIr(String text) {
        if (text == null || text.isBlank()) return null;
        // Find the outermost JSON object
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            JsonNode node = objectMapper.readTree(text.substring(start, end + 1));
            String intent = textOr(node, "intent", "SELECT");
            String targetTable = textOr(node, "targetTable", null);
            String svcName = textOr(node, "serviceName", null);
            String orderBy = textOr(node, "orderByColumn", null);
            String orderDir = textOr(node, "orderDirection", "ASC");
            String metricName = textOr(node, "metricName", null);

            Integer limit = null;
            JsonNode limitNode = node.get("limitCount");
            if (limitNode != null && limitNode.isNumber()) limit = limitNode.asInt();

            List<String> selectCols = List.of("*");
            JsonNode selNode = node.get("selectColumns");
            if (selNode != null && selNode.isArray()) {
                List<String> tmp = new ArrayList<>();
                selNode.forEach(n -> tmp.add(n.asText()));
                if (!tmp.isEmpty()) selectCols = tmp;
            }

            List<FilterClause> filters = List.of();
            JsonNode filNode = node.get("filters");
            if (filNode != null && filNode.isArray()) {
                filters = objectMapper.readValue(
                        objectMapper.writeValueAsString(filNode),
                        new TypeReference<List<FilterClause>>() {});
            }

            return new SemanticQueryIR(intent, targetTable, svcName, selectCols, filters,
                    orderBy, orderDir, limit, metricName);
        } catch (Exception e) {
            log.warn("Failed to parse IR JSON: {}", e.getMessage());
            return null;
        }
    }

    private String textOr(JsonNode node, String field, String fallback) {
        JsonNode n = node.get(field);
        return (n != null && n.isTextual() && !n.asText().equalsIgnoreCase("null"))
                ? n.asText() : fallback;
    }
}
