package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.contractsentinel.agent.AgentTool;
import io.contractsentinel.query.DbQueryResponse;
import io.contractsentinel.query.DbQueryService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Runs EXPLAIN [ANALYZE] over a read-only SELECT to inspect the query plan (e.g. sequential scans). */
@Component
@RequiredArgsConstructor
public class ExplainQueryTool implements AgentTool {

    private final DbQueryService dbQueryService;
    private final ServiceRegistryRepository serviceRegistryRepository;
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String name() {
        return "explain_query";
    }

    @Override
    public String description() {
        return "Run EXPLAIN ANALYZE on a read-only SELECT against a service's database and return the plan. "
                + "The SQL must be a single SELECT; prefix it with 'EXPLAIN ANALYZE '.";
    }

    @Override
    public String parametersJsonSchema() {
        return """
            {"type":"object","properties":{
              "service":{"type":"string"},
              "sql":{"type":"string","description":"EXPLAIN ANALYZE SELECT ... (single read-only statement)"}},
             "required":["service","sql"]}
            """;
    }

    @Override
    public String execute(JsonNode args) throws Exception {
        ServiceRegistry service = ToolSupport.resolveService(serviceRegistryRepository, args);
        String sql = args.path("sql").asText("");
        if (!sql.toUpperCase().contains("EXPLAIN")) {
            sql = "EXPLAIN ANALYZE " + sql;
        }
        DbQueryResponse response = dbQueryService.explain(service.getId(), sql);
        return mapper.writeValueAsString(response.rows());
    }
}
