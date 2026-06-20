package io.contractsentinel.infrastructure;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.*;

@Component
@Slf4j
public class NginxConfigParser {

    // Matches: upstream name { ... server host:port ... }
    private static final Pattern UPSTREAM_BLOCK = Pattern.compile(
            "upstream\\s+(\\S+)\\s*\\{([^}]*?)\\}", Pattern.DOTALL);

    // Matches: server host:port;
    private static final Pattern SERVER_DIRECTIVE = Pattern.compile(
            "server\\s+[^:]+:(\\d+)");

    // Matches: location /path/ { ... }
    private static final Pattern LOCATION_BLOCK = Pattern.compile(
            "location\\s+(\\S+)\\s*\\{([^}]*?)\\}", Pattern.DOTALL);

    // Matches proxy_pass http(s)://upstream_name[/];
    private static final Pattern PROXY_PASS = Pattern.compile(
            "proxy_pass\\s+https?://([^/\\s;]+)(/[^;\\s]*)?\\s*;");

    public List<NginxRoute> parse(String configText) {
        if (configText == null || configText.isBlank()) {
            return Collections.emptyList();
        }

        // Build upstream -> port map
        Map<String, Integer> upstreamPorts = new HashMap<>();
        Matcher upstreamMatcher = UPSTREAM_BLOCK.matcher(configText);
        while (upstreamMatcher.find()) {
            String upstreamName = upstreamMatcher.group(1);
            String upstreamBody = upstreamMatcher.group(2);
            Matcher serverMatcher = SERVER_DIRECTIVE.matcher(upstreamBody);
            if (serverMatcher.find()) {
                try {
                    upstreamPorts.put(upstreamName, Integer.parseInt(serverMatcher.group(1)));
                } catch (NumberFormatException e) {
                    log.warn("Could not parse port for upstream {}", upstreamName);
                    upstreamPorts.put(upstreamName, 0);
                }
            } else {
                upstreamPorts.put(upstreamName, 0);
            }
        }

        List<NginxRoute> routes = new ArrayList<>();
        Matcher locationMatcher = LOCATION_BLOCK.matcher(configText);
        while (locationMatcher.find()) {
            String location = locationMatcher.group(1);
            String locationBody = locationMatcher.group(2);

            Matcher proxyMatcher = PROXY_PASS.matcher(locationBody);
            if (!proxyMatcher.find()) {
                continue;
            }

            String upstreamName = proxyMatcher.group(1);
            // group(2) is the path part after the upstream (e.g. "/" or null)
            String pathAfterUpstream = proxyMatcher.group(2);
            boolean proxyPassHasTrailingSlash = pathAfterUpstream != null && pathAfterUpstream.equals("/");

            // trailingSlashIssue: location ends with "/" but proxy_pass does NOT end with "/"
            boolean locationEndsWithSlash = location.endsWith("/");
            boolean trailingSlashIssue = locationEndsWithSlash && !proxyPassHasTrailingSlash;

            int targetPort = upstreamPorts.getOrDefault(upstreamName, 0);

            routes.add(new NginxRoute(location, upstreamName, targetPort, trailingSlashIssue));
        }

        return routes;
    }
}
