package io.contractsentinel.catalogue;

import java.util.List;
import java.util.UUID;

public record CatalogueEntryDto(
        UUID serviceId,
        String serviceName,
        String httpMethod,
        String path,
        String summary,
        String operationId,
        List<String> tags,
        List<ParameterInfo> parameters,
        List<FieldInfo> requestFields,
        List<FieldInfo> responseFields
) {
}
