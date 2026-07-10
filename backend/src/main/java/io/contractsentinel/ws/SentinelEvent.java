package io.contractsentinel.ws;

import java.time.Instant;

public record SentinelEvent(String type, Instant at, Object payload) {

    public static SentinelEvent of(String type, Object payload) {
        return new SentinelEvent(type, Instant.now(), payload);
    }
}
