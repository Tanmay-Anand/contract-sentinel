package io.contractsentinel.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Regex-level (not full-grammar) extraction of the salient facts from a migration statement:
 * what kind of change, which table, and which columns. Good enough to seed the risk agent's prompt.
 */
public final class MigrationSqlParser {

    public record ParsedMigration(String operation, String table, List<String> columns) {}

    private static final Pattern ALTER = Pattern.compile("(?i)ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:\\w+\\.)?(\\w+)");
    private static final Pattern ADD_COLUMN = Pattern.compile("(?i)ADD\\s+(?:COLUMN\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?(\\w+)");
    private static final Pattern DROP_COLUMN = Pattern.compile("(?i)DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?(\\w+)");
    private static final Pattern CREATE_INDEX = Pattern.compile("(?i)CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+.*?\\bON\\s+(?:\\w+\\.)?(\\w+)");
    private static final Pattern DROP_TABLE = Pattern.compile("(?i)DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:\\w+\\.)?(\\w+)");
    private static final Pattern CREATE_TABLE = Pattern.compile("(?i)CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:\\w+\\.)?(\\w+)");

    private MigrationSqlParser() {}

    public static ParsedMigration parse(String sql) {
        String s = sql == null ? "" : sql.trim();

        Matcher dropTable = DROP_TABLE.matcher(s);
        if (dropTable.find()) {
            return new ParsedMigration("DROP_TABLE", dropTable.group(1), List.of());
        }
        Matcher createTable = CREATE_TABLE.matcher(s);
        if (createTable.find()) {
            return new ParsedMigration("CREATE_TABLE", createTable.group(1), List.of());
        }
        Matcher createIndex = CREATE_INDEX.matcher(s);
        if (createIndex.find()) {
            return new ParsedMigration("CREATE_INDEX", createIndex.group(1), List.of());
        }

        Matcher alter = ALTER.matcher(s);
        if (alter.find()) {
            String table = alter.group(1);
            List<String> columns = new ArrayList<>();
            String operation = "ALTER_TABLE";
            Matcher drop = DROP_COLUMN.matcher(s);
            while (drop.find()) {
                columns.add(drop.group(1));
                operation = "DROP_COLUMN";
            }
            if (columns.isEmpty()) {
                Matcher add = ADD_COLUMN.matcher(s);
                while (add.find()) {
                    columns.add(add.group(1));
                    operation = "ADD_COLUMN";
                }
            }
            return new ParsedMigration(operation, table, columns);
        }
        return new ParsedMigration("UNKNOWN", null, List.of());
    }
}
