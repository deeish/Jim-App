# LLM cost tracking (roadmap)

Week 2 asks for **LLM cost tracking** toward a future dashboard. Safer than silently hacking Groq calls everywhere: do this in **phases** so production traffic is not disrupted.

## Phase 1 — Structured logs (low risk)

- Backend already emits generation summaries for `/plans/generate-sessions` in development; extend structured logs in production (no PII) with:
  - `userId` (internal id or hash if required)
  - `model`, `promptTokens`, `completionTokens`, `totalTokens` (when available from the Groq SDK response)
  - `route`, `durationMs`, `finishReason`
- Ship logs to stdout; aggregate with your log vendor later.

## Phase 2 — Persistence (medium risk)

- Add a table such as `LlmUsageLog` (userId, window start, tokens, currency estimate, createdAt) with retention policy.
- Write **after** successful generation only; on failure log without double-charging logic.

## Phase 3 — Dashboard (product)

- Simple admin query or Metabase/retool over `LlmUsageLog` + daily spend estimate from Groq pricing.

## Guardrails

- Never log full prompts or raw workout health data in production logs.
- Align with per-user throttles (`AiThrottlerGuard`) so spend stays bounded per account.

This file is intentionally not a full implementation; pair Phase 1 with request-ID middleware when you add it (Week 1).
