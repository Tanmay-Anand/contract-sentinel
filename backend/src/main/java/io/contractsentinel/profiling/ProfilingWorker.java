package io.contractsentinel.profiling;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/**
 * Drives a profiling run end-to-end on a background thread: start the remote JFR recording, poll
 * until it completes, download the base64 {@code .jfr}, parse it, and persist the hottest methods.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ProfilingWorker {

    private static final int TOP_N = 25;
    private static final long POLL_INTERVAL_MS = 2000;

    private final ProfilingStore store;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final RestClient restClient = RestClient.builder()
            .requestFactory(factory())
            .build();

    private static SimpleClientHttpRequestFactory factory() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(Duration.ofSeconds(5));
        f.setReadTimeout(Duration.ofSeconds(30));
        return f;
    }

    @Async("profilingExecutor")
    public void profileAsync(UUID runId) {
        Path temp = null;
        try {
            ProfilingStore.Target target = store.loadTarget(runId);

            store.status(runId, ProfilingRun.Status.RECORDING);
            restClient.post()
                    .uri(target.actuatorBaseUrl())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("durationSeconds", target.durationSeconds()))
                    .retrieve()
                    .toBodilessEntity();

            String state = pollUntilComplete(target);
            if (!"COMPLETE".equals(state)) {
                throw new IllegalStateException("JFR recording did not complete in time (last state: " + state + ")");
            }

            store.status(runId, ProfilingRun.Status.DOWNLOADING);
            String downloadJson = restClient.get()
                    .uri(target.actuatorBaseUrl() + "/download")
                    .retrieve()
                    .body(String.class);
            JsonNode node = objectMapper.readTree(downloadJson);
            byte[] jfrBytes = Base64.getDecoder().decode(node.path("data").asText(""));

            temp = Files.createTempFile("sentinel-remote-", ".jfr");
            Files.write(temp, jfrBytes);

            store.status(runId, ProfilingRun.Status.PARSING);
            JfrParser.ParsedProfile profile = JfrParser.topFrames(temp, TOP_N);
            store.complete(runId, profile.totalSamples(), profile.frames());
            log.info("Profiling run {} complete: {} samples, {} hot methods",
                    runId, profile.totalSamples(), profile.frames().size());

        } catch (Exception e) {
            log.warn("Profiling run {} failed: {}", runId, e.getMessage());
            store.fail(runId, e.getMessage() != null ? e.getMessage() : e.toString());
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // best effort
                }
            }
        }
    }

    private String pollUntilComplete(ProfilingStore.Target target) throws InterruptedException {
        long deadline = System.currentTimeMillis() + (target.durationSeconds() + 30L) * 1000L;
        String state = "";
        while (System.currentTimeMillis() < deadline) {
            Thread.sleep(POLL_INTERVAL_MS);
            try {
                String statusJson = restClient.get()
                        .uri(target.actuatorBaseUrl())
                        .retrieve()
                        .body(String.class);
                state = objectMapper.readTree(statusJson).path("state").asText("");
                if ("COMPLETE".equals(state)) {
                    return state;
                }
            } catch (Exception e) {
                log.debug("Poll of {} failed (will retry): {}", target.actuatorBaseUrl(), e.getMessage());
            }
        }
        return state;
    }
}
