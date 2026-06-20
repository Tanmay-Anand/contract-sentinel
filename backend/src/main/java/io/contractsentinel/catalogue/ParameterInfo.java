package io.contractsentinel.catalogue;

public record ParameterInfo(
        String name,
        String in,
        boolean required,
        String type,
        String description
) {
}
