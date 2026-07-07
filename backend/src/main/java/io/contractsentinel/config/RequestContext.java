package io.contractsentinel.config;

public final class RequestContext {

    private static final ThreadLocal<String> REQUEST_ID = new ThreadLocal<>();

    private RequestContext() {}

    public static void setRequestId(String id) {
        REQUEST_ID.set(id);
    }

    public static String getRequestId() {
        String id = REQUEST_ID.get();
        return id != null ? id : "unknown";
    }

    public static void clear() {
        REQUEST_ID.remove();
    }
}
