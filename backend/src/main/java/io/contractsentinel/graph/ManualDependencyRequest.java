package io.contractsentinel.graph;

import java.util.UUID;

public record ManualDependencyRequest(
        UUID sourceServiceId,
        UUID targetServiceId,
        String label
) {
}
