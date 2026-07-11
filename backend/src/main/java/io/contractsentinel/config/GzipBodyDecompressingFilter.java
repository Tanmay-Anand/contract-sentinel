package io.contractsentinel.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.zip.GZIPInputStream;

/**
 * Decompresses gzip-encoded request bodies before Spring MVC processes them.
 * Needed because Spring Boot 4's ZipkinHttpClientSender automatically compresses
 * Zipkin span payloads above 1 KB using Content-Encoding: gzip, which embedded
 * Tomcat does not transparently decompress.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class GzipBodyDecompressingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if ("gzip".equalsIgnoreCase(request.getHeader("Content-Encoding"))) {
            filterChain.doFilter(new GzipBodyRequestWrapper(request), response);
        } else {
            filterChain.doFilter(request, response);
        }
    }

    private static class GzipBodyRequestWrapper extends HttpServletRequestWrapper {

        private final byte[] decompressedBody;

        GzipBodyRequestWrapper(HttpServletRequest request) throws IOException {
            super(request);
            try (GZIPInputStream gzip = new GZIPInputStream(request.getInputStream())) {
                this.decompressedBody = gzip.readAllBytes();
            }
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream in = new ByteArrayInputStream(decompressedBody);
            return new ServletInputStream() {
                @Override public boolean isFinished()                      { return in.available() == 0; }
                @Override public boolean isReady()                         { return true; }
                @Override public void setReadListener(ReadListener l)      {}
                @Override public int read()                                { return in.read(); }
                @Override public int read(byte[] b, int off, int len)     { return in.read(b, off, len); }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream()));
        }

        @Override
        public String getHeader(String name) {
            if ("Content-Encoding".equalsIgnoreCase(name)) return null;
            if ("Content-Length".equalsIgnoreCase(name))   return String.valueOf(decompressedBody.length);
            return super.getHeader(name);
        }

        @Override public int  getContentLength()     { return decompressedBody.length; }
        @Override public long getContentLengthLong() { return decompressedBody.length; }
    }
}
