package io.contractsentinel.agent;

import jakarta.validation.constraints.NotBlank;

public record SchemaRiskRequest(@NotBlank String migrationSql) {}
