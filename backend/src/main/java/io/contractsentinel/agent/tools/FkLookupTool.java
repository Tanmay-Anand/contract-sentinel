package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import io.contractsentinel.agent.AgentTool;
import io.contractsentinel.graph.SharedDbSchemaService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Finds every foreign key into or out of a table â€” the "who else touches this table" question. */
@Component
@RequiredArgsConstructor
public class FkLookupTool implements AgentTool {

    private final SharedDbSchemaService sharedDbSchemaService;
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String name() {
        return "fk_lookup";
    }

    @Override
    public String description() {
        return "List all foreign keys referencing or originating from a given table across shared databases.";
    }

    @Override
    public String parametersJsonSchema() {
        return """
            {"type":"object","properties":{"table":{"type":"string"}},"required":["table"]}
            """;
    }

    @Override
    public String execute(JsonNode args) throws Exception {
        String table = args.path("table").asText("");
        if (table.isBlank()) {
            throw new IllegalArgumentException("Provide a 'table' argument");
        }
        ArrayNode out = mapper.createArrayNode();
        for (SharedDbSchemaService.DbSchemaGroupDto group : sharedDbSchemaService.getDbGraph()) {
            for (SharedDbSchemaService.ForeignKeyDto fk : group.foreignKeys()) {
                if (table.equalsIgnoreCase(fk.fromTable()) || table.equalsIgnoreCase(fk.toTable())) {
                    out.addObject()
                            .put("service", group.serviceGroupName())
                            .put("fromTable", fk.fromTable())
                            .put("fromColumn", fk.fromColumn())
                            .put("toTable", fk.toTable())
                            .put("toColumn", fk.toColumn());
                }
            }
        }
        return out.isEmpty() ? "No foreign keys found involving table '" + table + "'" : mapper.writeValueAsString(out);
    }
}
