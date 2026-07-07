package io.contractsentinel.graph;

import java.time.Instant;
import java.util.List;

public record ServiceGraphDto(
        List<ServiceNodeDto> nodes,
        List<ServiceEdgeDto> edges,
        Instant computedAt
) {
}
