package io.contractsentinel.exception;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SentinelException extends RuntimeException {

    private final HttpStatus status;
    private final String requestId;

    public SentinelException(String message, HttpStatus status, String requestId) {
        super(message);
        this.status = status;
        this.requestId = requestId;
    }

    public static SentinelException notFound(String message, String requestId) {
        return new SentinelException(message, HttpStatus.NOT_FOUND, requestId);
    }

    public static SentinelException badRequest(String message, String requestId) {
        return new SentinelException(message, HttpStatus.BAD_REQUEST, requestId);
    }
}
