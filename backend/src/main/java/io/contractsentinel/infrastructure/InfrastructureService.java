package io.contractsentinel.infrastructure;

import java.util.List;

public interface InfrastructureService {

    List<ContainerDto> listContainers();

    List<GatewayHealthDto> checkGatewayHealth();

    List<NginxRoute> parseNginxConfig(String configText);
}
