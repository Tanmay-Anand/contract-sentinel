package io.contractsentinel.ws;

import tools.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
@RequiredArgsConstructor
@Slf4j
public class SentinelWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper;
    private final CopyOnWriteArraySet<WebSocketSession> sessions = new CopyOnWriteArraySet<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        sessions.add(session);
        String handshake = objectMapper.writeValueAsString(
                SentinelEvent.of("connected", Map.of("version", "1.0", "sessionId", session.getId())));
        synchronized (session) {
            session.sendMessage(new TextMessage(handshake));
        }
        log.debug("WebSocket client connected: {} (active: {})", session.getId(), sessions.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.debug("WebSocket client disconnected: {} status={} (active: {})",
                session.getId(), status.getCode(), sessions.size());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        sessions.remove(session);
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
        TextMessage message = new TextMessage(json);
        sessions.removeIf(session -> {
            if (!session.isOpen()) {
                return true;
            }
            try {
                synchronized (session) {
                    session.sendMessage(message);
                }
                return false;
            } catch (Exception e) {
                log.debug("Send failed for session {}, removing: {}", session.getId(), e.getMessage());
                return true;
            }
        });
    }
}
