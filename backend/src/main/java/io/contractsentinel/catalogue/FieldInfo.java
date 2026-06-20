package io.contractsentinel.catalogue;

public record FieldInfo(
        String name,
        String type,
        boolean required,
        String description
) {
}
