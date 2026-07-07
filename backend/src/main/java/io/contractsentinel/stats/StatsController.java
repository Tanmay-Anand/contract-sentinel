package io.contractsentinel.stats;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stats")
@RequiredArgsConstructor
public class StatsController {

    private final OutboundCallCounter counter;

    @GetMapping("/call-count")
    public CallCountDto callCount() {
        return counter.snapshot();
    }
}
