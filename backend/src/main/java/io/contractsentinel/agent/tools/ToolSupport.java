package io.contractsentinel.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;

import java.util.UUID;

/** Shared helpers for agent tools: resolving the target service from model-supplied arguments. */
final class ToolSupport {

    private ToolSupport() {}

    /** Resolve a service from a {@code service}/{@code serviceName} name or {@code serviceId}. */
    static ServiceRegistry resolveService(ServiceRegistryRepository repo, JsonNode args) {
        if (args.hasNonNull("serviceId")) {
            try {
                UUID id = UUID.fromString(args.get("serviceId").asText());
                return repo.findById(id).orElseThrow(() -> notFound(args));
            } catch (IllegalArgumentException ignored) {
                // fall through to name resolution
            }
        }
        String name = firstNonBlank(args, "service", "serviceName");
        if (name != null) {
            return repo.findByName(name).orElseGet(() -> repo.findAllByActiveTrue().stream()
                    .filter(s -> s.getName().toLowerCase().contains(name.toLowerCase()))
                    .findFirst()
                    .orElseThrow(() -> notFound(args)));
        }
        throw new IllegalArgumentException("Provide a 'service' name argument");
    }

    static String firstNonBlank(JsonNode args, String... keys) {
        for (String key : keys) {
            JsonNode node = args.get(key);
            if (node != null && !node.asText("").isBlank()) {
                return node.asText();
            }
        }
        return null;
    }

    private static IllegalArgumentException notFound(JsonNode args) {
        return new IllegalArgumentException("No matching service for: " + args);
    }
}
