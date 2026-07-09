package io.contractsentinel.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Autonomous performance-diagnosis agent. It follows an investigative playbook â€” latency regression,
 * deployment correlation, usage spike, EXPLAIN on the inferred query, connection-pool check â€” and
 * emits a ranked hypothesis list. Each step is conditional on what the previous tool returned.
 */
@Component
@RequiredArgsConstructor
public class DiagnosisAgent {

    private static final String SYSTEM_PROMPT = """
        You are a senior performance engineer investigating a slow API endpoint. You have tools to
        inspect latency history, deployments, usage, database query plans (EXPLAIN ANALYZE) and the
        connection pool. Work the problem step by step, and let each step depend on what you found:

        1. Use latency_trend to confirm whether there is a regression (latest p95 vs baseline).
        2. If there is a regression, use deployment_history to see if a deploy lines up with it.
        3. Use usage_trend to check whether the endpoint is being hit unusually often.
        4. Infer the most likely SQL for this endpoint from its path (use fk_lookup / row_count to
           understand the tables) and run explain_query with EXPLAIN ANALYZE to inspect the plan â€”
           look for sequential scans on large tables, missing indexes, or nested-loop blowups.
        5. Only if the query plan looks efficient, check connection_pool for pending connections.

        Call one tool at a time. When you have enough evidence, STOP calling tools and give your
        final answer as concise markdown: a ranked list of hypotheses, each with the evidence that
        supports it and a concrete recommended fix. Do not invent data you did not observe.""";

    private static final String VOLATILITY_PREAMBLE = """
        The endpoint has been flagged as having ERRATIC (highly variable) latency rather than being
        uniformly slow. Focus your investigation on causes of inconsistency â€” intermittent cache
        misses, lock contention, or occasional expensive query paths â€” using the same tools.

        """;

    private final AgentExecutor executor;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final List<AgentTool> allTools;
    private final ObjectMapper mapper = new ObjectMapper();

    public UUID diagnose(UUID serviceId, String method, String path, String mode) {
        ServiceRegistry service = serviceRegistryRepository.findById(serviceId)
                .orElseThrow(() -> SentinelException.notFound("Service not found: " + serviceId, RequestContext.getRequestId()));

        List<AgentTool> tools = allTools.stream()
                .filter(t -> !t.name().equals("frontend_grep"))
                .toList();

        String allServices = serviceRegistryRepository.findAllByActiveTrue().stream()
                .map(ServiceRegistry::getName).collect(Collectors.joining(", "));

        boolean volatility = "VOLATILITY".equalsIgnoreCase(mode);
        String system = (volatility ? VOLATILITY_PREAMBLE : "") + SYSTEM_PROMPT;
        String user = String.format(
                "Diagnose %s %s on service '%s'. Known services: %s. Use exactly the service name '%s' "
                + "in tool calls.",
                method, path, service.getName(), allServices, service.getName());

        String inputJson = writeInput(Map.of(
                "serviceId", serviceId.toString(), "method", method, "path", path,
                "mode", mode == null ? "" : mode));
        return executor.start(AgentRun.AgentType.DIAGNOSE, inputJson, system, user, tools);
    }

    private String writeInput(Map<String, String> input) {
        try {
            return mapper.writeValueAsString(input);
        } catch (Exception e) {
            return "{}";
        }
    }
}
