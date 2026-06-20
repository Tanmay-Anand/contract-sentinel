package io.contractsentinel.snapshot;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

public interface SpecSnapshotService {

    Page<SpecSnapshotDto> listByService(UUID serviceId, Pageable pageable);

    String pollAll();

    String pollOne(UUID serviceId);

    String redetect(UUID serviceId);
}
