package io.contractsentinel.agent;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record DiagnoseRequest(
        @NotNull UUID serviceId,
        @NotBlank String method,
        @NotBlank String path,
        String mode
) {}
