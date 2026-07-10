package io.contractsentinel.core;

import lombok.Getter;
import org.springframework.data.domain.Page;

import java.util.List;

@Getter
public class PaginatedResponse<T> {

    private final List<T> content;
    private final int pageNumber;     // 1-based, matches post-sales convention
    private final int pageSize;
    private final long totalElements;
    private final int totalPages;
    private final boolean first;
    private final boolean last;
    private final boolean empty;
    private final long from;          // 1-based start record index
    private final long to;            // end record index

    public PaginatedResponse(Page<T> page) {
        this.content       = page.getContent();
        this.pageNumber    = page.getNumber() + 1;
        this.pageSize      = page.getSize();
        this.totalElements = page.getTotalElements();
        this.totalPages    = page.getTotalPages();
        this.first         = page.isFirst();
        this.last          = page.isLast();
        this.empty         = page.isEmpty();
        this.from          = page.isEmpty() ? 0 : (long) page.getNumber() * page.getSize() + 1;
        this.to            = page.isEmpty() ? 0 : this.from + page.getNumberOfElements() - 1;
    }
}
