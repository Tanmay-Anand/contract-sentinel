package io.contractsentinel.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
@RequiredArgsConstructor
@Slf4j
public class SentinelWebSocketHandler extends TextWebSocketHandler {

    // A slow/stuck client must not block the broadcast thread. The decorator serialises
    // sends per-session and enforces these limits — if a send takes longer than
    // SEND_TIME_LIMIT_MS the session is marked as exceeded and the next send throws,
    // causing it to be removed from the active set.
    private static final int SEND_TIME_LIMIT_MS   = 5_000;
    private static final int BUFFER_SIZE_LIMIT_BYTES = 512 * 1024;

    private final ObjectMapper objectMapper;
    private final CopyOnWriteArraySet<ConcurrentWebSocketSessionDecorator> sessions =
            new CopyOnWriteArraySet<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        ConcurrentWebSocketSessionDecorator decorated = new ConcurrentWebSocketSessionDecorator(
                session, SEND_TIME_LIMIT_MS, BUFFER_SIZE_LIMIT_BYTES);
        sessions.add(decorated);
        String handshake = objectMapper.writeValueAsString(
                SentinelEvent.of("connected", Map.of("version", "1.0", "sessionId", session.getId())));
        decorated.sendMessage(new TextMessage(handshake));
        log.debug("WebSocket client connected: {} (active: {})", session.getId(), sessions.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.removeIf(d -> d.getId().equals(session.getId()));
        log.debug("WebSocket client disconnected: {} status={} (active: {})",
                session.getId(), status.getCode(), sessions.size());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        sessions.removeIf(d -> d.getId().equals(session.getId()));
        log.debug("WebSocket transport error for {}: {}", session.getId(), exception.getMessage());
    }

    public void broadcast(SentinelEvent event) {
        if (sessions.isEmpty()) {
            return;
        }
        String json;
        try {
            json = objectMapper.writeValueAsString(event);
        } catch (Exception e) {
            log.warn("Failed to serialize WebSocket event '{}': {}", event.type(), e.getMessage());
            return;
        }
        sendToAll(new TextMessage(json));
    }

    @Scheduled(fixedDelayString = "${sentinel.ws.heartbeat-interval-ms:30000}")
    public void heartbeat() {
        if (sessions.isEmpty()) return;
        String ping;
        try {
            ping = objectMapper.writeValueAsString(
                    SentinelEvent.of("ping", Map.of("t", Instant.now().toEpochMilli())));
        } catch (Exception e) {
            return;
        }
        sendToAll(new TextMessage(ping));
    }

    private void sendToAll(TextMessage message) {
        sessions.removeIf(session -> {
            if (!session.isOpen()) {
                return true;
            }
            try {
                session.sendMessage(message);
                return false;
            } catch (Exception e) {
                log.debug("Send failed for session {}, removing: {}", session.getId(), e.getMessage());
                try { session.close(CloseStatus.SESSION_NOT_RELIABLE); } catch (Exception ignored) {}
                return true;
            }
        });
    }
}
