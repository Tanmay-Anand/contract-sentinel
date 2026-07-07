package io.contractsentinel.exception;

import io.contractsentinel.config.RequestContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.HttpRequestMethodNotSupportedException;

import java.util.NoSuchElementException;
import java.util.stream.Collectors;

@Slf4j
@ControllerAdvice
@RestControllerAdvice
public class HttpExceptionHandler {

    @ExceptionHandler(SentinelException.class)
    public ResponseEntity<SentinelException> handleSentinel(SentinelException ex) {
        log.warn("SentinelException [{}]: {}", ex.getStatus(), ex.getMessage());
        return ResponseEntity.status(ex.getStatus()).body(ex);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<SentinelException> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .collect(Collectors.joining(", "));
        String rid = RequestContext.getRequestId();
        log.warn("Validation failed: {} | requestId={}", message, rid);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new SentinelException(message, HttpStatus.BAD_REQUEST, rid));
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<SentinelException> handleHandlerMethodValidation(HandlerMethodValidationException ex) {
        String rid = RequestContext.getRequestId();
        log.warn("Handler method validation failed: {} | requestId={}", ex.getMessage(), rid);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new SentinelException(ex.getMessage(), HttpStatus.BAD_REQUEST, rid));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<SentinelException> handleNotReadable(HttpMessageNotReadableException ex) {
        String rid = RequestContext.getRequestId();
        log.warn("Message not readable: {} | requestId={}", ex.getMessage(), rid);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new SentinelException("The request body could not be read. Please check your input.", HttpStatus.BAD_REQUEST, rid));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<SentinelException> handleMissingParam(MissingServletRequestParameterException ex) {
        String rid = RequestContext.getRequestId();
        String message = ex.getParameterName() + " parameter is missing";
        log.warn("Missing parameter: {} | requestId={}", ex.getParameterName(), rid);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new SentinelException(message, HttpStatus.BAD_REQUEST, rid));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<SentinelException> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        String rid = RequestContext.getRequestId();
        String type = ex.getRequiredType() != null ? ex.getRequiredType().getSimpleName() : "unknown";
        String message = String.format("'%s' should be a valid '%s' and '%s' isn't", ex.getName(), type, ex.getValue());
        log.warn("Type mismatch: parameter '{}' | requestId={}", ex.getName(), rid);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new SentinelException(message, HttpStatus.BAD_REQUEST, rid));
    }

    @ExceptionHandler({ IllegalArgumentException.class, IllegalStateException.class })
    public ResponseEntity<SentinelException> handleIllegalArgumentAndState(RuntimeException ex) {
        String rid = RequestContext.getRequestId();
        log.warn("Invalid argument or state: {} | requestId={}", ex.getMessage(), rid);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new SentinelException(ex.getMessage(), HttpStatus.BAD_REQUEST, rid));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<SentinelException> handleNoSuchElement(NoSuchElementException ex) {
        String rid = RequestContext.getRequestId();
        log.warn("Resource not found: {} | requestId={}", ex.getMessage(), rid);
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new SentinelException(ex.getMessage(), HttpStatus.NOT_FOUND, rid));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<SentinelException> handleNoResourceFound(NoResourceFoundException ex) {
        String rid = RequestContext.getRequestId();
        log.warn("Resource not found: {} | requestId={}", ex.getMessage(), rid);
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new SentinelException(ex.getMessage(), HttpStatus.NOT_FOUND, rid));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<SentinelException> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        String rid = RequestContext.getRequestId();
        log.warn("Method not supported: {} | requestId={}", ex.getMessage(), rid);
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(new SentinelException(ex.getMessage(), HttpStatus.METHOD_NOT_ALLOWED, rid));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<SentinelException> handleGeneric(Exception ex) {
        String rid = RequestContext.getRequestId();
        log.error("Unhandled exception: {} | requestId={}", ex.getMessage(), rid, ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new SentinelException("An unexpected error occurred. Please try again later.", HttpStatus.INTERNAL_SERVER_ERROR, rid));
    }
}

