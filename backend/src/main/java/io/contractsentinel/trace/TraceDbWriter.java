package io.contractsentinel.trace;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class TraceDbWriter {

    private final TraceSpanRepository spanRepository;

    @Async("traceDbExecutor")
    @Transactional
    public void saveAsync(List<TraceSpan> entities) {
        try {
            spanRepository.saveAll(entities);
        } catch (Exception e) {
            log.error("Async trace DB write failed for {} span(s): {}", entities.size(), e.getMessage(), e);
        }
    }
}
