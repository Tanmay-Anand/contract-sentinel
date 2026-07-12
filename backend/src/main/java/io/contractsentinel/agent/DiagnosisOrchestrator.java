package io.contractsentinel.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.llm.LlmClient;
import io.contractsentinel.llm.LlmMessage;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Deterministic performance-diagnosis state machine.
 * Unlike {@link DiagnosisAgent} (which lets the LLM pick which tools to call),
 * this orchestrator follows a fixed evidence-gathering sequence and uses the LLM
 * only for the final narrative synthesis step.
 *
 * State sequence:
 *   LATENCY_CHECK â†’ [regression â‰¥ 1.25Ã—] DEPLOYMENT_CHECK
 *   â†’ USAGE_CHECK â†’ QUERY_PLAN â†’ [no seq scan] CONNECTION_POOL â†’ NARRATE
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DiagnosisOrchestrator {

    private static final double REGRESSION_THRESHOLD = 1.25;

    private final AgentRunStore store;
    private final LlmClient llmClient;
    private final ServiceRegistryRepository serviceRepo;
    private final List<AgentTool> allTools;
    private final ObjectMapper mapper = new ObjectMapper();

    public UUID diagnose(UUID serviceId, String method, String path) {
        ServiceRegistry service = serviceRepo.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId,
                        RequestContext.getRequestId()));

        String inputJson;
        try {
            inputJson = mapper.writeValueAsString(Map.of(
                    "serviceId", serviceId.toString(), "method", method, "path", path));
        } catch (Exception e) {
            inputJson = "{}";
        }

        UUID runId = store.create(AgentRun.AgentType.DIAGNOSE_STRUCTURED, inputJson, llmClient.provider());
        runAsync(runId, service, method, path);
        return runId;
    }

    @Async("agentTaskExecutor")
    protected void runAsync(UUID runId, ServiceRegistry service, String method, String path) {
        Map<String, AgentTool> toolMap = allTools.stream()
                .collect(Collectors.toMap(AgentTool::name, Function.identity(), (a, b) -> a));

        List<String> evidence = new ArrayList<>();
        try {
            // â”€â”€ Step 1: Latency check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            String latencyResult = invoke(runId, toolMap, "latency_trend", args -> {
                args.put("service", service.getName());
                args.put("method", method);
                args.put("path", path);
                args.put("days", 7);
            });
            evidence.add("**Latency trend:**\n" + latencyResult);

            boolean hasRegression = detectRegression(latencyResult);

            // â”€â”€ Step 2: Deployment history (only when regression detected) â”€â”€â”€â”€
            if (hasRegression) {
                store.appendStep(runId, "thought", null,
                        "Latency regression â‰¥ " + REGRESSION_THRESHOLD + "Ã—. Checking deployment history.");
                String deployResult = invoke(runId, toolMap, "deployment_history",
                        args -> args.put("service", service.getName()));
                evidence.add("**Recent deployments:**\n" + deployResult);
            }

            // â”€â”€ Step 3: Usage trend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            String usageResult = invoke(runId, toolMap, "usage_trend", args -> {
                args.put("service", service.getName());
                args.put("method", method);
                args.put("path", path);
            });
            evidence.add("**Usage trend:**\n" + usageResult);

            // â”€â”€ Step 4: Query plan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            store.appendStep(runId, "thought", null,
                    "Inferring query from endpoint path and running EXPLAIN ANALYZE.");
            String inferredSql = "EXPLAIN ANALYZE " + inferSql(method, path);
            String explainResult = invoke(runId, toolMap, "explain_query", args -> {
                args.put("service", service.getName());
                args.put("sql", inferredSql);
            });
            evidence.add("**Query plan (`" + inferSql(method, path) + "`):**\n" + explainResult);

            boolean hasSeqScan = explainResult.toLowerCase().contains("seq scan");

            // â”€â”€ Step 5: Connection pool (only if query plan looks fine) â”€â”€â”€â”€â”€â”€â”€
            if (!hasSeqScan) {
                String poolResult = invoke(runId, toolMap, "connection_pool",
                        args -> args.put("service", service.getName()));
                evidence.add("**Connection pool:**\n" + poolResult);
            }

            // â”€â”€ Step 6: LLM narration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            store.appendStep(runId, "thought", null,
                    "All evidence gathered. Producing ranked hypothesis list.");
            store.incrementIteration(runId);
            long narrationStart = System.currentTimeMillis();
            String narrative = narrate(service.getName(), method, path, evidence);
            store.recordLlmCall(runId, 1, evidence.size() + 2, System.currentTimeMillis() - narrationStart);
            store.complete(runId, narrative);

        } catch (Exception e) {
            log.warn("Structured diagnosis {} failed: {}", runId, e.getMessage());
            store.fail(runId, "Diagnosis failed: " + e.getMessage());
        }
    }

    // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private String invoke(UUID runId, Map<String, AgentTool> toolMap, String toolName,
                          Consumer<ObjectNode> argsBuilder) {
        AgentTool tool = toolMap.get(toolName);
        if (tool == null) return "(tool '" + toolName + "' not available)";
        ObjectNode args = mapper.createObjectNode();
        argsBuilder.accept(args);
        store.appendStep(runId, "tool_call", toolName, args.toString());
        try {
            String result = tool.execute(args);
            store.appendStep(runId, "tool_result", toolName, result);
            return result;
        } catch (Exception e) {
            String err = "ERROR: " + e.getMessage();
            store.appendStep(runId, "tool_result", toolName, err);
            return err;
        }
    }

    private boolean detectRegression(String latencyJson) {
        try {
            JsonNode node = mapper.readTree(latencyJson);
            double ratio = node.path("regressionRatio").asDouble(1.0);
            return ratio >= REGRESSION_THRESHOLD;
        } catch (Exception e) {
            return false;
        }
    }

    private String inferSql(String method, String path) {
        String[] parts = path.replaceAll("\\{[^}]+}", "").split("/");
        String tableName = "items";
        for (int i = parts.length - 1; i >= 0; i--) {
            String p = parts[i].trim();
            if (!p.isBlank()) {
                tableName = p.replaceAll("[^a-zA-Z_]", "_").toLowerCase();
                break;
            }
        }
        return "SELECT * FROM " + tableName + " LIMIT 1";
    }

    private String narrate(String serviceName, String method, String path, List<String> evidence) {
        String context = String.join("\n\n", evidence);
        String system = """
                You are a senior performance engineer. Based on the structured evidence below,
                produce a concise markdown report:
                1. A ranked list of hypotheses (most likely first)
                2. For each: the evidence supporting it and a concrete recommended fix
                3. A brief summary of what was NOT the cause
                Do not invent data beyond what is in the evidence.
                """;
        String user = "Service: " + serviceName + "\nEndpoint: " + method + " " + path
                + "\n\nEvidence collected by deterministic investigation:\n\n" + context;
        try {
            return llmClient.chat(List.of(LlmMessage.system(system), LlmMessage.user(user)),
                    List.of()).content();
        } catch (Exception e) {
            return "**Narration failed:** " + e.getMessage() + "\n\n**Raw evidence:**\n" + context;
        }
    }
}
