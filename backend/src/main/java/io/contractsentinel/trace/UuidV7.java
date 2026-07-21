package io.contractsentinel.trace;

import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Generates UUIDv7 identifiers (RFC 9562). The high 48 bits carry the unix millisecond
 * timestamp, making PKs time-ordered. For time-series tables like cs_trace_spans this
 * eliminates B-tree page splits and yields much better write throughput than random UUIDv4.
 */
final class UuidV7 {

    private UuidV7() {}

    static UUID generate() {
        long ms = System.currentTimeMillis();
        ThreadLocalRandom rng = ThreadLocalRandom.current();
        long randA = rng.nextLong() & 0x0FFFL;               // 12 random bits
        long randB = rng.nextLong() & 0x3FFFFFFFFFFFFFFFL;   // 62 random bits
        long msb = (ms << 16) | 0x7000L | randA;             // ver=7 in bits 12-15
        long lsb = 0x8000000000000000L | randB;              // var=0b10 in bits 62-63
        return new UUID(msb, lsb);
    }
}
