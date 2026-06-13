package io.contractsentinel.seed;

import io.contractsentinel.config.SentinelProperties;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.registry.ServiceRegistryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataSeeder implements ApplicationRunner {

    private final ServiceRegistryRepository repository;
    private final SentinelProperties properties;

    @Override
    public void run(ApplicationArguments args) {
        for (SentinelProperties.ServiceConfig cfg : properties.getServices()) {
            if (cfg.getName() == null || cfg.getBaseUrl() == null) {
                log.warn("Skipping service config with missing name or baseUrl");
                continue;
            }
            if (!repository.existsByName(cfg.getName())) {
                repository.save(ServiceRegistry.builder()
                        .name(cfg.getName())
                        .baseUrl(cfg.getBaseUrl())
                        .specPath(cfg.getSpecPath())
                        .active(true)
                        .build());
                log.info("Registered service: {} → {}{}", cfg.getName(), cfg.getBaseUrl(), cfg.getSpecPath());
            }
        }
    }
}
