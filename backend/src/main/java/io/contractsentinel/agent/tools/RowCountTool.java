package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import io.contractsentinel.agent.AgentTool;
import io.contractsentinel.graph.SharedDbSchemaService;
import io.contractsentinel.query.DbQueryResponse;
import io.contractsentinel.query.DbQueryService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Set;

/** Counts rows in a table. The table name is validated against the known schema (never raw-concatenated). */
@Component
@RequiredArgsConstructor
public class RowCountTool implements AgentTool {

    private final DbQueryService dbQueryService;
    private final SharedDbSchemaService sharedDbSchemaService;
    private final ServiceRegistryRepository serviceRegistryRepository;

    @Override
    public String name() {
        return "row_count";
    }

    @Override
    public String description() {
        return "Count rows in a table (schema 'crm'). Table must be a real table in the shared schema.";
    }

    @Override
    public String parametersJsonSchema() {
        return """
            {"type":"object","properties":{
              "service":{"type":"string"},
              "table":{"type":"string"}},
             "required":["service","table"]}
            """;
    }

    @Override
    public String execute(JsonNode args) {
        ServiceRegistry service = ToolSupport.resolveService(serviceRegistryRepository, args);
        String table = args.path("table").asText("");
        if (!isKnownTable(table)) {
            throw new IllegalArgumentException("Unknown table '" + table + "' â€” not present in the shared schema");
        }
        DbQueryResponse response = dbQueryService.execute(service.getId(),
                "SELECT count(*) AS n FROM crm." + table);
        Object count = response.rows().isEmpty() ? 0 : response.rows().get(0).get(0);
        return "{\"table\":\"" + table + "\",\"rowCount\":" + count + "}";
    }

    private boolean isKnownTable(String table) {
        if (table == null || table.isBlank() || !table.matches("[A-Za-z0-9_]+")) {
            return false;
        }
        Set<String> known = new HashSet<>();
        for (SharedDbSchemaService.DbSchemaGroupDto group : sharedDbSchemaService.getDbGraph()) {
            group.tables().forEach(t -> known.add(t.tableName().toLowerCase()));
        }
        return known.contains(table.toLowerCase());
    }
}
