package io.contractsentinel.drift;

import io.contractsentinel.alert.AlertService;
import io.contractsentinel.registry.ServiceRegistry;
import io.contractsentinel.snapshot.SpecSnapshot;
import io.contractsentinel.ws.WebSocketEventPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Golden-corpus tests for DriftDetectionServiceImpl. Each test supplies two minimal
 * OpenAPI JSON strings (before/after) and asserts that exactly the expected DriftEvent(s)
 * are saved, with the right changeType, severity, and fieldPath.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DriftDetectionTest {

    @Mock private DriftEventRepository driftEventRepository;
    @Mock private AlertService alertService;
    @Mock private WebSocketEventPublisher eventPublisher;

    private DriftDetectionServiceImpl service;
    private ServiceRegistry svc;
    private SpecSnapshot prev;
    private SpecSnapshot curr;

    @BeforeEach
    void setUp() {
        service = new DriftDetectionServiceImpl(driftEventRepository, alertService, eventPublisher);
        svc = new ServiceRegistry();
        svc.setId(UUID.randomUUID());
        svc.setName("test-service");

        // Dedup check always returns false so all events reach saveAll.
        when(driftEventRepository.existsByServiceAndChangeTypeAndHttpMethodAndApiPathAndFieldPath(
                any(), any(), any(), any(), any())).thenReturn(false);
        when(driftEventRepository.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void detectsPathRemovedAsBreaking() {
        prev = snapshot(specWithPath("GET", "/units"));
        curr = snapshot(specWithoutPaths());

        service.detectAndPersist(svc, prev, curr);

        List<DriftEvent> saved = captureEvents();
        assertThat(saved).hasSize(1);
        DriftEvent e = saved.get(0);
        assertThat(e.getChangeType()).isEqualTo(DriftEvent.ChangeType.PATH_REMOVED);
        assertThat(e.getSeverity()).isEqualTo(DriftEvent.Severity.BREAKING);
        assertThat(e.getHttpMethod()).isEqualTo("GET");
        assertThat(e.getApiPath()).isEqualTo("/units");
        assertThat(e.getFieldPath()).isNull();
    }

    @Test
    void detectsPathAddedAsSafe() {
        prev = snapshot(specWithoutPaths());
        curr = snapshot(specWithPath("POST", "/bookings"));

        service.detectAndPersist(svc, prev, curr);

        List<DriftEvent> saved = captureEvents();
        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getChangeType()).isEqualTo(DriftEvent.ChangeType.PATH_ADDED);
        assertThat(saved.get(0).getSeverity()).isEqualTo(DriftEvent.Severity.SAFE);
    }

    @Test
    void detectsResponseFieldRemovedWithFieldPath() {
        prev = snapshot(specWithResponseField("GET", "/units", "id", "string"));
        curr = snapshot(specWithoutResponseField("GET", "/units"));

        service.detectAndPersist(svc, prev, curr);

        List<DriftEvent> saved = captureEvents();
        assertThat(saved).hasSize(1);
        DriftEvent e = saved.get(0);
        assertThat(e.getChangeType()).isEqualTo(DriftEvent.ChangeType.RESPONSE_FIELD_REMOVED);
        assertThat(e.getSeverity()).isEqualTo(DriftEvent.Severity.BREAKING);
        assertThat(e.getFieldPath()).isEqualTo("id");
    }

    @Test
    void detectsResponseFieldTypeChangedAsBreaking() {
        prev = snapshot(specWithResponseField("GET", "/units", "price", "string"));
        curr = snapshot(specWithResponseField("GET", "/units", "price", "number"));

        service.detectAndPersist(svc, prev, curr);

        List<DriftEvent> saved = captureEvents();
        assertThat(saved).anySatisfy(e -> {
            assertThat(e.getChangeType()).isEqualTo(DriftEvent.ChangeType.RESPONSE_FIELD_TYPE_CHANGED);
            assertThat(e.getSeverity()).isEqualTo(DriftEvent.Severity.BREAKING);
            assertThat(e.getFieldPath()).isEqualTo("price");
        });
    }

    @Test
    void twoDistinctFieldRemovalsProduceTwoEvents() {
        prev = snapshot(specWithTwoResponseFields("GET", "/units"));
        curr = snapshot(specWithoutResponseField("GET", "/units"));

        service.detectAndPersist(svc, prev, curr);

        List<DriftEvent> saved = captureEvents();
        long removals = saved.stream()
                .filter(e -> e.getChangeType() == DriftEvent.ChangeType.RESPONSE_FIELD_REMOVED)
                .count();
        assertThat(removals).isEqualTo(2);
    }

    @Test
    void nullSpecsAreSkipped() {
        prev = snapshot(null);
        curr = snapshot(specWithPath("GET", "/units"));

        service.detectAndPersist(svc, prev, curr);

        verify(driftEventRepository, never()).saveAll(any());
    }

    // ── helpers ──────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<DriftEvent> captureEvents() {
        ArgumentCaptor<List<DriftEvent>> captor = ArgumentCaptor.forClass(List.class);
        verify(driftEventRepository, atLeastOnce()).saveAll(captor.capture());
        return captor.getValue();
    }

    private SpecSnapshot snapshot(String json) {
        SpecSnapshot s = new SpecSnapshot();
        s.setId(UUID.randomUUID());
        s.setService(svc);
        s.setSpecJson(json);
        s.setFetchedAt(Instant.now());
        return s;
    }

    private String specWithPath(String method, String path) {
        String httpMethod = method.toLowerCase();
        return """
                {
                  "openapi": "3.0.0",
                  "info": {"title": "Test", "version": "1.0"},
                  "paths": {
                    "%s": {
                      "%s": {
                        "responses": {"200": {"description": "ok"}}
                      }
                    }
                  }
                }
                """.formatted(path, httpMethod);
    }

    private String specWithoutPaths() {
        return """
                {
                  "openapi": "3.0.0",
                  "info": {"title": "Test", "version": "1.0"},
                  "paths": {}
                }
                """;
    }

    private String specWithResponseField(String method, String path, String field, String type) {
        String httpMethod = method.toLowerCase();
        return """
                {
                  "openapi": "3.0.0",
                  "info": {"title": "Test", "version": "1.0"},
                  "paths": {
                    "%s": {
                      "%s": {
                        "responses": {
                          "200": {
                            "description": "ok",
                            "content": {
                              "application/json": {
                                "schema": {
                                  "type": "object",
                                  "properties": {
                                    "%s": {"type": "%s"}
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
                """.formatted(path, httpMethod, field, type);
    }

    private String specWithoutResponseField(String method, String path) {
        String httpMethod = method.toLowerCase();
        return """
                {
                  "openapi": "3.0.0",
                  "info": {"title": "Test", "version": "1.0"},
                  "paths": {
                    "%s": {
                      "%s": {
                        "responses": {
                          "200": {
                            "description": "ok",
                            "content": {
                              "application/json": {
                                "schema": {"type": "object", "properties": {}}
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
                """.formatted(path, httpMethod);
    }

    private String specWithTwoResponseFields(String method, String path) {
        String httpMethod = method.toLowerCase();
        return """
                {
                  "openapi": "3.0.0",
                  "info": {"title": "Test", "version": "1.0"},
                  "paths": {
                    "%s": {
                      "%s": {
                        "responses": {
                          "200": {
                            "description": "ok",
                            "content": {
                              "application/json": {
                                "schema": {
                                  "type": "object",
                                  "properties": {
                                    "id": {"type": "string"},
                                    "name": {"type": "string"}
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
                """.formatted(path, httpMethod);
    }
}
