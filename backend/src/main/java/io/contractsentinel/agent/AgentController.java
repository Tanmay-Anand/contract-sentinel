package io.contractsentinel.agent;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/agents")
@RequiredArgsConstructor
@Tag(name = "AI Agents", description = "Autonomous performance-diagnosis and schema-risk agents")
public class AgentController {

    private final DiagnosisAgent diagnosisAgent;
    private final DiagnosisOrchestrator diagnosisOrchestrator;
    private final SchemaRiskAgent schemaRiskAgent;
    private final AgentRunStore store;
    private final AgentLoop agentLoop;

    @PostMapping("/diagnose")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Start a performance-diagnosis agent run for an endpoint")
    public AgentRunDto diagnose(@Valid @RequestBody DiagnoseRequest request) {
        UUID runId = diagnosisAgent.diagnose(request.serviceId(), request.method(), request.path(), request.mode());
        return store.get(runId);
    }

    @PostMapping("/diagnose-structured")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Start a deterministic diagnosis (state machine); LLM only used for final narration")
    public AgentRunDto diagnoseStructured(@Valid @RequestBody DiagnoseRequest request) {
        UUID runId = diagnosisOrchestrator.diagnose(request.serviceId(), request.method(), request.path());
        return store.get(runId);
    }

    @PostMapping("/schema-risk")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Start a schema-change risk assessment for a migration statement")
    public AgentRunDto schemaRisk(@Valid @RequestBody SchemaRiskRequest request) {
        UUID runId = schemaRiskAgent.assess(request.migrationSql());
        return store.get(runId);
    }

    @GetMapping("/runs/{runId}")
    @Operation(summary = "Poll an agent run's status, live steps, and final result")
    public AgentRunDto getRun(@PathVariable UUID runId) {
        return store.get(runId);
    }

    @GetMapping("/runs")
    @Operation(summary = "List recent agent runs, optionally filtered by type")
    public List<AgentRunDto> history(@RequestParam(required = false) AgentRun.AgentType type) {
        return store.history(type);
    }

    @DeleteMapping("/runs/{runId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Request cancellation of a running agent run")
    public void cancel(@PathVariable UUID runId) {
        agentLoop.cancel(runId);
    }
}
