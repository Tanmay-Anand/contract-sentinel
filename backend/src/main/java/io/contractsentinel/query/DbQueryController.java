package io.contractsentinel.query;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/db")
@RequiredArgsConstructor
@Tag(name = "Database Query", description = "Developer read-only SQL query console")
public class DbQueryController {

    private final DbQueryService dbQueryService;
    private final NlQueryService nlQueryService;

    @PostMapping("/query")
    @Operation(summary = "Execute a read-only SELECT query against a registered service's database")
    public DbQueryResponse query(@RequestBody @Validated DbQueryRequest request) {
        return dbQueryService.execute(request.serviceId(), request.sql());
    }

    @PostMapping("/nl-query")
    @Operation(summary = "Translate a natural-language question to SQL via Semantic Query IR and execute it")
    public NlQueryResponse nlQuery(@RequestBody @Validated NlQueryRequest request) {
        return nlQueryService.query(request.serviceId(), request.question());
    }
}
