package io.contractsentinel.alert;

import tools.jackson.databind.ObjectMapper;
import io.contractsentinel.config.RequestContext;
import io.contractsentinel.exception.SentinelException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AlertServiceImpl implements AlertService {

    private final AlertConfigRepository configRepo;
    private final AlertEventRepository eventRepo;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final RestClient restClient = RestClient.builder().build();

    @Override
    @Transactional(readOnly = true)
    public List<AlertConfigDto> listConfigs() {
        return configRepo.findAll().stream()
                .map(AlertConfigDto::from)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<AlertEventDto> listEvents() {
        return eventRepo.findTop50ByOrderByFiredAtDesc().stream()
                .map(AlertEventDto::from)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public AlertConfigDto createConfig(AlertConfigDto.AlertConfigRequest req) {
        AlertConfig config = AlertConfig.builder()
                .name(req.name())
                .channel(req.channel())
                .destination(req.destination())
                .triggerOnBreaking(req.triggerOnBreaking())
                .triggerOnUnreachable(req.triggerOnUnreachable())
                .triggerOnSafe(req.triggerOnSafe())
                .serviceFilter(req.serviceFilter())
                .cooldownMinutes(req.cooldownMinutes())
                .build();
        return AlertConfigDto.from(configRepo.save(config));
    }

    @Override
    @Transactional
    public AlertConfigDto updateConfig(UUID id, AlertConfigDto.AlertConfigRequest req) {
        AlertConfig config = configRepo.findById(id)
                .orElseThrow(() -> SentinelException.notFound("Alert config not found: " + id, RequestContext.getRequestId()));
        config.setName(req.name());
        config.setChannel(req.channel());
        config.setDestination(req.destination());
        config.setTriggerOnBreaking(req.triggerOnBreaking());
        config.setTriggerOnUnreachable(req.triggerOnUnreachable());
        config.setTriggerOnSafe(req.triggerOnSafe());
        config.setServiceFilter(req.serviceFilter());
        config.setCooldownMinutes(req.cooldownMinutes());
        return AlertConfigDto.from(configRepo.save(config));
    }

    @Override
    @Transactional
    public void deleteConfig(UUID id) {
        AlertConfig config = configRepo.findById(id)
                .orElseThrow(() -> SentinelException.notFound("Alert config not found: " + id, RequestContext.getRequestId()));
        configRepo.delete(config);
    }

    @Override
    @Transactional
    public AlertConfigDto testConfig(UUID id) {
        AlertConfig config = configRepo.findById(id)
                .orElseThrow(() -> SentinelException.notFound("Alert config not found: " + id, RequestContext.getRequestId()));
        dispatchAlert(config, "Test notification from ContractSentinel", "TEST", UUID.randomUUID(), "test-service");
        return AlertConfigDto.from(config);
    }

    @Override
    @Transactional
    public void evaluateBreaking(UUID serviceId, String serviceName, String changeType, String path) {
        List<AlertConfig> configs = configRepo.findAllByEnabledTrue();
        for (AlertConfig config : configs) {
            if (!config.isTriggerOnBreaking()) {
                continue;
            }
            if (config.getServiceFilter() != null && !config.getServiceFilter().equals(serviceId)) {
                continue;
            }
            if (isWithinCooldown(config, serviceId)) {
                log.debug("Skipping alert for config {} / service {} — within cooldown", config.getId(), serviceId);
                continue;
            }
            String message = "🚨 Breaking change in " + serviceName + ": " + changeType + " on " + path;
            dispatchAlert(config, message, "BREAKING_CHANGE", serviceId, serviceName);
        }
    }

    @Override
    @Transactional
    public void evaluateUnreachable(UUID serviceId, String serviceName) {
        List<AlertConfig> configs = configRepo.findAllByEnabledTrue();
        for (AlertConfig config : configs) {
            if (!config.isTriggerOnUnreachable()) {
                continue;
            }
            if (config.getServiceFilter() != null && !config.getServiceFilter().equals(serviceId)) {
                continue;
            }
            if (isWithinCooldown(config, serviceId)) {
                log.debug("Skipping alert for config {} / service {} — within cooldown", config.getId(), serviceId);
                continue;
            }
            String message = "🔴 Service unreachable: " + serviceName;
            dispatchAlert(config, message, "UNREACHABLE", serviceId, serviceName);
        }
    }

    private boolean isWithinCooldown(AlertConfig config, UUID serviceId) {
        Optional<AlertEvent> lastEvent = eventRepo.findTopByConfigIdAndServiceIdOrderByFiredAtDesc(config.getId(), serviceId);
        if (lastEvent.isEmpty()) {
            return false;
        }
        Instant cooldownUntil = lastEvent.get().getFiredAt().plus(config.getCooldownMinutes(), ChronoUnit.MINUTES);
        return Instant.now().isBefore(cooldownUntil);
    }

    private void dispatchAlert(AlertConfig config, String message, String triggerType, UUID serviceId, String serviceName) {
        String payload;
        try {
            if (config.getChannel() == AlertChannel.SLACK) {
                Map<String, String> slackBody = new HashMap<>();
                slackBody.put("text", message);
                payload = objectMapper.writeValueAsString(slackBody);
            } else {
                Map<String, Object> webhookBody = new HashMap<>();
                webhookBody.put("event", triggerType);
                webhookBody.put("service", serviceName);
                webhookBody.put("message", message);
                webhookBody.put("timestamp", Instant.now().toString());
                payload = objectMapper.writeValueAsString(webhookBody);
            }

            restClient.post()
                    .uri(config.getDestination())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();

            AlertTriggerType alertTriggerType = toAlertTriggerType(triggerType);
            AlertEvent event = AlertEvent.builder()
                    .configId(config.getId())
                    .serviceId(serviceId)
                    .serviceName(serviceName)
                    .triggerType(alertTriggerType)
                    .message(message)
                    .delivered(true)
                    .build();
            eventRepo.save(event);

        } catch (Exception ex) {
            log.warn("Failed to dispatch alert to {} for config {}: {}", config.getDestination(), config.getId(), ex.getMessage());
            try {
                AlertTriggerType alertTriggerType = toAlertTriggerType(triggerType);
                AlertEvent event = AlertEvent.builder()
                        .configId(config.getId())
                        .serviceId(serviceId)
                        .serviceName(serviceName)
                        .triggerType(alertTriggerType)
                        .message(message)
                        .delivered(false)
                        .errorMessage(ex.getMessage())
                        .build();
                eventRepo.save(event);
            } catch (Exception saveEx) {
                log.warn("Failed to save alert event after dispatch failure: {}", saveEx.getMessage());
            }
        }
    }

    private AlertTriggerType toAlertTriggerType(String triggerType) {
        try {
            return AlertTriggerType.valueOf(triggerType);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
