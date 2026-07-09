package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import io.contractsentinel.agent.AgentTool;
import io.contractsentinel.catalogue.ApiCatalogueService;
import io.contractsentinel.catalogue.CatalogueEntryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/** Searches the API catalogue â€” used to find which endpoints return or touch a given resource. */
@Component
@RequiredArgsConstructor
public class CatalogueSearchTool implements AgentTool {

    private final ApiCatalogueService catalogueService;
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String name() {
        return "catalogue_search";
    }

    @Override
    public String description() {
        return "Search all API endpoints across services by keyword (matches path/summary). "
                + "Use to find endpoints that expose a resource, e.g. 'booking'.";
    }

    @Override
    public String parametersJsonSchema() {
        return """
            {"type":"object","properties":{
              "query":{"type":"string"},
              "method":{"type":"string"}},
             "required":["query"]}
            """;
    }

    @Override
    public String execute(JsonNode args) throws Exception {
        String query = args.path("query").asText("");
        String method = args.hasNonNull("method") ? args.get("method").asText() : null;
        List<CatalogueEntryDto> results = catalogueService.search(query, null, method);

        ArrayNode out = mapper.createArrayNode();
        results.stream().limit(25).forEach(e -> out.addObject()
                .put("service", e.serviceName())
                .put("method", e.httpMethod())
                .put("path", e.path())
                .put("summary", e.summary()));
        return out.isEmpty() ? "No endpoints match '" + query + "'" : mapper.writeValueAsString(out);
    }
}
