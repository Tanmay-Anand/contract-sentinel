package io.contractsentinel.sampler;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.UUID;

public interface ResponseSamplerService {

    SampledEndpointDto createEndpoint(SampledEndpointDto.SampledEndpointRequest req);

    void deleteEndpoint(UUID id);

    List<SampledEndpointDto> listEndpoints();

    SamplingResultDto runSample(UUID endpointId);

    Page<SamplingResultDto> listResults(UUID endpointId, Pageable pageable);

    void scheduleAll();

    List<EndpointSizeDto> getEndpointSizes();

    List<EndpointSizeDto> getHeaviestEndpoints(UUID serviceId);

    CorrelationResponse correlation(UUID endpointId);
}
