package io.contractsentinel.knowledge;

import java.util.List;
import java.util.UUID;

public interface KnowledgeService {

    List<SynonymDto> listSynonyms(Boolean approvedOnly, String serviceName);
    SynonymDto createSynonym(CreateSynonymRequest req);
    SynonymDto approveSynonym(UUID id);
    void deleteSynonym(UUID id);
    List<SynonymDto> proposeSynonymsFromSchema(UUID serviceId);

    List<MetricDto> listMetrics(Boolean approvedOnly, String serviceName);
    MetricDto createMetric(CreateMetricRequest req);
    MetricDto approveMetric(UUID id);
    void deleteMetric(UUID id);
    List<MetricDto> proposeMetricsFromSchema(UUID serviceId);

    List<ServiceKnowledgeSummaryDto> getServiceGraph();

    ResolveTermsResponse resolveTerms(String text);
}
