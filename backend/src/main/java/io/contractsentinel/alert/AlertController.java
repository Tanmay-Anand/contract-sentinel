package io.contractsentinel.alert;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/alerts")
@RequiredArgsConstructor
@Tag(name = "Alerting", description = "Alert configurations and notification history")
public class AlertController {

    private final AlertService alertService;

    @GetMapping("/configs")
    @Operation(summary = "List all alert configurations")
    public List<AlertConfigDto> listConfigs() {
        return alertService.listConfigs();
    }

    @PostMapping("/configs")
    @Operation(summary = "Create a new alert configuration")
    public AlertConfigDto createConfig(@RequestBody @Valid AlertConfigDto.AlertConfigRequest req) {
        return alertService.createConfig(req);
    }

    @PutMapping("/configs/{id}")
    @Operation(summary = "Update an alert configuration")
    public AlertConfigDto updateConfig(@PathVariable UUID id,
                                       @RequestBody @Valid AlertConfigDto.AlertConfigRequest req) {
        return alertService.updateConfig(id, req);
    }

    @DeleteMapping("/configs/{id}")
    @Operation(summary = "Delete an alert configuration")
    public ResponseEntity<Void> deleteConfig(@PathVariable UUID id) {
        alertService.deleteConfig(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/configs/{id}/test")
    @Operation(summary = "Send a test notification for an alert configuration")
    public AlertConfigDto testConfig(@PathVariable UUID id) {
        return alertService.testConfig(id);
    }

    @GetMapping("/events")
    @Operation(summary = "List the 50 most recent alert events")
    public List<AlertEventDto> listEvents() {
        return alertService.listEvents();
    }
}
