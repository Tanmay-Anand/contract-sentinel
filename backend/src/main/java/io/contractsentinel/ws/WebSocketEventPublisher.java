package io.contractsentinel.ws;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Thin wrapper around the WebSocket handler that swallows all errors.
 * A failed broadcast must never propagate up to a DB write path.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketEventPublisher {

    private final SentinelWebSocketHandler handler;

    public void publish(String type, Object payload) {
        try {
            handler.broadcast(SentinelEvent.of(type, payload));
        } catch (Exception e) {
            log.warn("WebSocket broadcast suppressed for event '{}': {}", type, e.getMessage());
        }
    }
}
