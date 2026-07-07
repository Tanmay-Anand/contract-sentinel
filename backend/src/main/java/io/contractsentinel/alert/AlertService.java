package io.contractsentinel.alert;

import java.util.List;
import java.util.UUID;

public interface AlertService {

    AlertConfigDto createConfig(AlertConfigDto.AlertConfigRequest req);

    AlertConfigDto updateConfig(UUID id, AlertConfigDto.AlertConfigRequest req);

    void deleteConfig(UUID id);

    AlertConfigDto testConfig(UUID id);

    List<AlertConfigDto> listConfigs();

    List<AlertEventDto> listEvents();

    void evaluateBreaking(UUID serviceId, String serviceName, String changeType, String path);

    void evaluateUnreachable(UUID serviceId, String serviceName);
}
