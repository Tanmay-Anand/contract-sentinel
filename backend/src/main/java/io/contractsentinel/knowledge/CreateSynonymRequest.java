package io.contractsentinel.knowledge;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateSynonymRequest(
        @NotBlank String term,
        @NotNull GraphSynonym.TargetType targetType,
        @NotBlank String targetName,
        String serviceName
) {}
