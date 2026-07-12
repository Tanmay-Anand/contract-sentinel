package io.contractsentinel.knowledge;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GraphSynonymRepository extends JpaRepository<GraphSynonym, UUID> {
    List<GraphSynonym> findAllByApprovedAtIsNotNull();
    List<GraphSynonym> findAllByApprovedAtIsNull();
    List<GraphSynonym> findAllByServiceName(String serviceName);
    List<GraphSynonym> findAllByServiceNameAndApprovedAtIsNotNull(String serviceName);
    List<GraphSynonym> findAllByServiceNameAndApprovedAtIsNull(String serviceName);
    long countByServiceNameAndApprovedAtIsNotNull(String serviceName);
    long countByServiceNameAndApprovedAtIsNull(String serviceName);
    boolean existsByTermIgnoreCaseAndTargetName(String term, String targetName);
}
