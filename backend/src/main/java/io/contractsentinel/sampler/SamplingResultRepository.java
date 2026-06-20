package io.contractsentinel.sampler;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SamplingResultRepository extends JpaRepository<SamplingResult, UUID> {

    Page<SamplingResult> findByEndpointOrderBySampledAtDesc(SampledEndpoint endpoint, Pageable pageable);

    Optional<SamplingResult> findTopByEndpointOrderBySampledAtDesc(SampledEndpoint endpoint);
}
