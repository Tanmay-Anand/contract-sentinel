package io.contractsentinel.sampler;

import java.util.UUID;

public record EndpointSizeDto(UUID serviceId, String httpMethod, String path, long responseSizeBytes) {}

