package io.contractsentinel.sampler;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/sampler")
@RequiredArgsConstructor
@Tag(name = "Response Sampler", description = "Sample real API responses and compare to spec")
public class SamplerController {

    private final ResponseSamplerService responseSamplerService;

    @GetMapping("/endpoints")
    @Operation(summary = "List all sampled endpoints")
    public List<SampledEndpointDto> listEndpoints() {
        return responseSamplerService.listEndpoints();
    }

    @PostMapping("/endpoints")
    @Operation(summary = "Register a new endpoint for response sampling")
    public SampledEndpointDto createEndpoint(@RequestBody SampledEndpointDto.SampledEndpointRequest req) {
        return responseSamplerService.createEndpoint(req);
    }

    @DeleteMapping("/endpoints/{id}")
    @Operation(summary = "Remove a sampled endpoint registration")
    public ResponseEntity<Void> deleteEndpoint(@PathVariable UUID id) {
        responseSamplerService.deleteEndpoint(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/endpoints/{id}/run")
    @Operation(summary = "Immediately run a sample for the given endpoint and return the result")
    public SamplingResultDto runSample(@PathVariable UUID id) {
        return responseSamplerService.runSample(id);
    }

    @GetMapping("/endpoints/{id}/results")
    @Operation(summary = "List past sampling results for an endpoint")
    public Page<SamplingResultDto> listResults(
            @PathVariable UUID id,
            @PageableDefault(size = 10) Pageable pageable) {
        return responseSamplerService.listResults(id, pageable);
    }
}
