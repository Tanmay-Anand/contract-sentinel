package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import io.contractsentinel.agent.AgentTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * Greps the configured frontend source tree for a term (pure Java {@code Files.walk}; no shelling
 * out, so it is safe on Windows). Used by the schema-risk agent to find TypeScript references to a
 * column or field about to change.
 */
@Component
@Slf4j
public class FrontendGrepTool implements AgentTool {

    private static final long MAX_FILE_BYTES = 1_000_000;
    private static final int HARD_CAP = 50;

    private final Path sourceDir;

    public FrontendGrepTool(@Value("${sentinel.frontend.source-dir:}") String sourceDir) {
        this.sourceDir = (sourceDir == null || sourceDir.isBlank()) ? null : Paths.get(sourceDir);
    }

    @Override
    public String name() {
        return "frontend_grep";
    }

    @Override
    public String description() {
        return "Search the frontend source (.ts/.tsx/.js/.jsx) for a term and return file:line matches.";
    }

    @Override
    public String parametersJsonSchema() {
        return """
            {"type":"object","properties":{
              "term":{"type":"string"},
              "maxResults":{"type":"integer","default":50}},
             "required":["term"]}
            """;
    }

    @Override
    public String execute(JsonNode args) throws IOException {
        if (sourceDir == null || !Files.isDirectory(sourceDir)) {
            return "Frontend source directory is not configured (sentinel.frontend.source-dir).";
        }
        String term = args.path("term").asText("");
        if (term.isBlank()) {
            throw new IllegalArgumentException("Provide a 'term' argument");
        }
        int maxResults = Math.min(HARD_CAP, args.path("maxResults").asInt(HARD_CAP));
        String needle = term.toLowerCase(Locale.ROOT);

        List<String> matches = new ArrayList<>();
        try (Stream<Path> walk = Files.walk(sourceDir)) {
            var iterator = walk.filter(Files::isRegularFile)
                    .filter(FrontendGrepTool::isSourceFile)
                    .iterator();
            while (iterator.hasNext() && matches.size() < maxResults) {
                Path file = iterator.next();
                scanFile(file, needle, matches, maxResults);
            }
        }
        if (matches.isEmpty()) {
            return "No frontend references to '" + term + "'";
        }
        return String.join("\n", matches);
    }

    private void scanFile(Path file, String needle, List<String> matches, int maxResults) {
        try {
            if (Files.size(file) > MAX_FILE_BYTES) {
                return;
            }
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            String rel = sourceDir.relativize(file).toString().replace('\\', '/');
            for (int i = 0; i < lines.size() && matches.size() < maxResults; i++) {
                if (lines.get(i).toLowerCase(Locale.ROOT).contains(needle)) {
                    matches.add(rel + ":" + (i + 1) + ": " + lines.get(i).trim());
                }
            }
        } catch (IOException | RuntimeException e) {
            log.debug("Skipping unreadable file {}: {}", file, e.getMessage());
        }
    }

    private static boolean isSourceFile(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        if (path.toString().replace('\\', '/').contains("/node_modules/")) {
            return false;
        }
        return name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".js") || name.endsWith(".jsx");
    }
}
