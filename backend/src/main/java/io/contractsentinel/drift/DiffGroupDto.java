package io.contractsentinel.drift;

import java.util.List;

public record DiffGroupDto(
        String httpMethod,
        String path,
        List<DiffChangeDto> changes
) {
}
