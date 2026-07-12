package io.contractsentinel.knowledge;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateMetricRequest(
        @NotBlank String name,
        @NotBlank String displayName,
        String description,
        @NotBlank String sqlDefinition,
        @NotBlank String anchorTable,
        String serviceName,
        @NotNull GraphMetric.AggregationFunction aggregationFunction
) {}
