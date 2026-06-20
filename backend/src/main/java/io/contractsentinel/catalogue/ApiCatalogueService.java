package io.contractsentinel.catalogue;

import java.util.List;
import java.util.UUID;

public interface ApiCatalogueService {

    List<CatalogueEntryDto> search(String query, UUID serviceId, String method);
}
