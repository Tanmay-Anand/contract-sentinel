package io.contractsentinel.agent;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Autonomous schema-change risk agent. Given a migration statement it fans out across row counts,
 * FK impact, owning services, affected endpoints and frontend references, then synthesises a risk
 * report a senior engineer would produce by hand before running a risky migration.
 */
@Component
@RequiredArgsConstructor
public class SchemaRiskAgent {

    private static final Set<String> TOOL_NAMES = Set.of(
            "row_count", "fk_lookup", "catalogue_search", "frontend_grep", "explain_query");

    private static final String SYSTEM_PROMPT = """
        You are a senior engineer assessing the risk of a database migration before it runs. Use the
        tools to gather evidence, then write a risk report. Investigate:

        - row_count on the affected table â€” a NOT NULL column with no default on a large populated
          table will fail; large tables also mean long-running rewrites/locks.
        - fk_lookup on the affected table â€” which tables reference it (cascade/blast radius)?
        - catalogue_search for the resource name â€” which endpoints return this data and could change?
        - frontend_grep for the affected column/table name â€” which TypeScript files reference it?

        Call one tool at a time; let findings guide the next call. When done, STOP and output a
        markdown report with these sections: Risk Level (LOW/MEDIUM/HIGH), Affected Tables & Row
        Counts, FK Impact, Owning Services, Affected Endpoints, Frontend References, Recommendation.
        The recommendation should give a safe path (e.g. add nullable â†’ backfill â†’ set NOT NULL).
        Base everything on tool output; do not fabricate counts or file names.""";

    private final AgentExecutor executor;
    private final List<AgentTool> allTools;

    public UUID assess(String migrationSql) {
        MigrationSqlParser.ParsedMigration parsed = MigrationSqlParser.parse(migrationSql);

        List<AgentTool> tools = allTools.stream()
                .filter(t -> TOOL_NAMES.contains(t.name()))
                .toList();

        String user = String.format("""
                Assess the risk of this migration:

                ```sql
                %s
                ```

                Parsed facts: operation=%s, table=%s, columns=%s.
                The database schema is 'crm'. Use the service that owns this table (try the CRM
                services by name) when a tool needs a service.""",
                migrationSql, parsed.operation(), parsed.table(), parsed.columns());

        return executor.start(AgentRun.AgentType.SCHEMA_RISK, migrationSql, SYSTEM_PROMPT, user, tools);
    }
}
