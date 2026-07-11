# Development Rules

Mandatory rules for AI assistance on this project. Apply to every task unless the user explicitly overrides a specific rule.

---

## Git & Version Control

1. **Never commit, push, or create Git commits unless the user explicitly instructs you to do so.** Do not amend, rebase, or force-push either.

---

## Architecture & Coupling

2. **Contract Sentinel is an isolated service.** Do not couple it directly to other services (post-sales API, CRM modules, etc.). Cross-service communication must go through well-defined interfaces — REST calls, shared DTOs, or published events — never direct class or package imports.

---

## Dual-Repo Sync

7. **Every change to `D:\work\Builder-CRM\builder-crm-api\contract-sentinel\` must be mirrored to `D:\Tanm\Projects\contract-sentinel\backend\`.** Similarly for the frontend: `D:\work\Builder-CRM\contract-sentinel-ui\` → `D:\Tanm\Projects\contract-sentinel\frontend\`.
8. **When syncing `.java` files via PowerShell, always write with `[IO.File]::WriteAllText(..., [Text.UTF8Encoding]::new($false))`** to avoid a UTF-8 BOM that breaks `javac`. Never use `Set-Content -Encoding utf8`.
9. **When syncing Java files to the OSS backend, rename the package** from `com.leadrat.crm.sentinel` → `io.contractsentinel`.

---

## Jackson 3 (applies to Spring Boot 4)

10. **Use Jackson 3 (`tools.jackson.*`) for all new code.** Do not import `com.fasterxml.jackson.core` or `com.fasterxml.jackson.databind`.
11. **Exception: Jackson annotations stay on the old package.** Jackson 3.0.x did not move annotations — keep imports as `com.fasterxml.jackson.annotation.*`.
12. **When injecting `ObjectMapper` as a Spring bean, use `tools.jackson.databind.ObjectMapper`.** Spring Boot 4 auto-configures the Jackson 3 type; injecting the Jackson 2 type (`com.fasterxml.jackson.databind.ObjectMapper`) will fail at startup.
13. **`JsonNode.fields()` → `properties()`.** In Jackson 3, `fields()` was removed; use `properties()` which returns `Iterable<Map.Entry<String, JsonNode>>`.
14. **`JsonProcessingException` → `tools.jackson.core.JacksonException`.** It is now unchecked — remove `throws` declarations when not needed.

---

## API Contracts

15. **Deprecate endpoints instead of deleting them.** Add `@Deprecated` on the method and `deprecated = true` in the Swagger `@Operation` annotation. Never delete the endpoint code.
16. **Paginate all list endpoints** using `Pageable`; include total counts in responses.

---

## WebSocket / Event Bus

17. **WebSocket broadcast errors must never propagate to the caller.** Always wrap `handler.broadcast(...)` in a try-catch that logs a warning and swallows the exception (`WebSocketEventPublisher` is the canonical pattern).
18. **Do not add STOMP, SockJS, or external WS libraries.** The event bus uses the native browser WebSocket API on the frontend and `TextWebSocketHandler` on the backend.

---

## Clarity & Documentation

19. **If a requirement is unclear, ask for clarification instead of making assumptions.** One wrong assumption in a cross-cutting concern (auth, schema, multi-tenancy) can require a large revert.
20. **Update documentation when behavior or architecture changes.** This includes `DEVELOPMENT_RULES.md`, `CLAUDE.md`, and files under `docs/` when the relevant module is affected (Try to use only `DEVELOPMENT_RULES.md`, `CLAUDE.md`. )
