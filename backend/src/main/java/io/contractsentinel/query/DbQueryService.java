package io.contractsentinel.query;

import java.util.UUID;

public interface DbQueryService {
    DbQueryResponse execute(UUID serviceId, String sql);

    /** Runs an EXPLAIN [ANALYZE] over a validated read-only SELECT. */
    DbQueryResponse explain(UUID serviceId, String sql);
}
