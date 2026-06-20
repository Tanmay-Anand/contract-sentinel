package io.contractsentinel.infrastructure;

import java.util.List;

public record ContainerDto(
        String id,
        String name,
        String image,
        String status,
        String health,
        boolean running,
        List<String> ports
) {
}
