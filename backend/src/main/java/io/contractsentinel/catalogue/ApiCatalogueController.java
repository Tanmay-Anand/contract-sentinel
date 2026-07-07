package io.contractsentinel.catalogue;

import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/catalogue")
@RequiredArgsConstructor
@Tag(name = "API Catalogue", description = "Search all endpoints across all services")
public class ApiCatalogueController {

    private final ApiCatalogueService apiCatalogueService;

    @GetMapping
    public List<CatalogueEntryDto> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) UUID serviceId,
            @RequestParam(required = false) String method
    ) {
        return apiCatalogueService.search(q, serviceId, method);
    }
}
