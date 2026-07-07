package io.contractsentinel.agent;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AgentRunRepository extends JpaRepository<AgentRun, UUID> {

    List<AgentRun> findTop20ByAgentTypeOrderByCreatedAtDesc(AgentRun.AgentType agentType);

    List<AgentRun> findTop20ByOrderByCreatedAtDesc();
}
