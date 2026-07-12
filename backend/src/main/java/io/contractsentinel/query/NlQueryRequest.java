package io.contractsentinel.query;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record NlQueryRequest(
        @NotNull UUID serviceId,
        @NotBlank String question
) {}
