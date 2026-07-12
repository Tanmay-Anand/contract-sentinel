package io.contractsentinel.knowledge;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/knowledge")
@RequiredArgsConstructor
@Tag(name = "Knowledge Graph")
public class KnowledgeController {

    private final KnowledgeService knowledgeService;

    // â”€â”€ Synonyms â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @GetMapping("/synonyms")
    @Operation(summary = "List synonyms; filter by ?approved=true|false and/or ?serviceName=")
    public List<SynonymDto> listSynonyms(
            @RequestParam(required = false) Boolean approved,
            @RequestParam(required = false) String serviceName) {
        return knowledgeService.listSynonyms(approved, serviceName);
    }

    @PostMapping("/synonyms")
    @Operation(summary = "Manually create a synonym (auto-approved)")
    public SynonymDto createSynonym(@Valid @RequestBody CreateSynonymRequest req) {
        return knowledgeService.createSynonym(req);
    }

    @PostMapping("/synonyms/{id}/approve")
    @Operation(summary = "Approve an LLM-proposed synonym")
    public SynonymDto approveSynonym(@PathVariable UUID id) {
        return knowledgeService.approveSynonym(id);
    }

    @DeleteMapping("/synonyms/{id}")
    @Operation(summary = "Delete a synonym")
    public void deleteSynonym(@PathVariable UUID id) {
        knowledgeService.deleteSynonym(id);
    }

    @PostMapping("/synonyms/propose/{serviceId}")
    @Operation(summary = "Ask the LLM to propose synonyms from the service schema (saved as pending)")
    public List<SynonymDto> proposeSynonyms(@PathVariable UUID serviceId) {
        return knowledgeService.proposeSynonymsFromSchema(serviceId);
    }

    // â”€â”€ Metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @GetMapping("/metrics")
    @Operation(summary = "List metrics; filter by ?approved=true|false and/or ?serviceName=")
    public List<MetricDto> listMetrics(
            @RequestParam(required = false) Boolean approved,
            @RequestParam(required = false) String serviceName) {
        return knowledgeService.listMetrics(approved, serviceName);
    }

    @PostMapping("/metrics")
    @Operation(summary = "Manually create a metric (auto-approved)")
    public MetricDto createMetric(@Valid @RequestBody CreateMetricRequest req) {
        return knowledgeService.createMetric(req);
    }

    @PostMapping("/metrics/{id}/approve")
    @Operation(summary = "Approve an LLM-proposed metric")
    public MetricDto approveMetric(@PathVariable UUID id) {
        return knowledgeService.approveMetric(id);
    }

    @DeleteMapping("/metrics/{id}")
    @Operation(summary = "Delete a metric")
    public void deleteMetric(@PathVariable UUID id) {
        knowledgeService.deleteMetric(id);
    }

    @PostMapping("/metrics/propose/{serviceId}")
    @Operation(summary = "Ask the LLM to propose business metrics from the service schema (saved as pending)")
    public List<MetricDto> proposeMetrics(@PathVariable UUID serviceId) {
        return knowledgeService.proposeMetricsFromSchema(serviceId);
    }

    // â”€â”€ Graph / service boundary view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @GetMapping("/graph")
    @Operation(summary = "Per-service knowledge graph summary (synonym and metric counts)")
    public List<ServiceKnowledgeSummaryDto> getServiceGraph() {
        return knowledgeService.getServiceGraph();
    }

    // â”€â”€ Term resolution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    @PostMapping("/resolve")
    @Operation(summary = "Resolve natural-language terms in a query text to schema entities via approved synonyms")
    public ResolveTermsResponse resolveTerms(@RequestBody ResolveTermsRequest req) {
        return knowledgeService.resolveTerms(req.text());
    }
}
