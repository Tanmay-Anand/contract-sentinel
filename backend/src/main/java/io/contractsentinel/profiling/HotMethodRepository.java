package io.contractsentinel.profiling;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface HotMethodRepository extends JpaRepository<HotMethod, UUID> {

    List<HotMethod> findByRunIdOrderByRank(UUID runId);
}
