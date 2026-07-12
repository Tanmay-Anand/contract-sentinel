package io.contractsentinel.query;

import java.util.UUID;

public interface NlQueryService {
    NlQueryResponse query(UUID serviceId, String question);
}
