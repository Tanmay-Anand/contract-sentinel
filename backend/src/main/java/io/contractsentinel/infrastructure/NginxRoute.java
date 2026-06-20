package io.contractsentinel.infrastructure;

public record NginxRoute(
        String location,
        String upstream,
        int targetPort,
        boolean trailingSlashIssue
) {
}
