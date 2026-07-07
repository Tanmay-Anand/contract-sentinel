package io.contractsentinel.drift;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

public interface DriftEventService {

    Page<DriftEventDto> list(UUID serviceId, String severity, Pageable pageable);

    DriftEventDto acknowledge(UUID id);

    DriftEventDto unacknowledge(UUID id);

    SpecDiffDto getDiff(UUID toSnapshotId);
}
