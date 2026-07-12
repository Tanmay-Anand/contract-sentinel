package io.contractsentinel.query;

import java.util.List;

public record IrValidationResult(boolean valid, List<String> errors) {

    public static IrValidationResult ok() {
        return new IrValidationResult(true, List.of());
    }

    public static IrValidationResult fail(List<String> errors) {
        return new IrValidationResult(false, errors);
    }

    public String errorSummary() {
        return String.join("; ", errors);
    }
}
