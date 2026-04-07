# Backend operations

## `NODE_ENV=production`

Set **`NODE_ENV=production`** in every hosted/staging environment. This enables:

- **JSON line logging** via `JsonProductionLogger` (stdout; ship to your log platform).
- **Sanitized error responses** for unexpected exceptions (no internal message or stack in the HTTP body; stack only in non-production).

Start command: `npm run start:prod` (runs `node dist/src/main` after `npm run build`).

## Health checks

| Endpoint | Use |
|----------|-----|
| **`GET /api/health`** | **Liveness** — process is up (no database). Use for simple load balancer pings. |
| **`GET /api/health/ready`** | **Readiness** — runs `SELECT 1` against PostgreSQL. Fails if DB is unreachable. |

No authentication on these routes.

Example:

```bash
curl -sS http://localhost:3000/api/health
curl -sS http://localhost:3000/api/health/ready
```

## Structured logging

In production, Nest logs use **single-line JSON** with fields: `level`, `ts`, `context`, `msg` (and similar for errors).

The global **`SanitizedExceptionFilter`** logs problems as JSON with **`method`** and **`path`** only — not headers, cookies, or request bodies (avoid leaking tokens and PII).

**Operations checklist:**

- [ ] Forward container/process stdout to your vendor (Datadog, CloudWatch, Grafana Loki, etc.).
- [ ] Alert on high rates of `level:error` and `kind:unhandled`.
- [ ] Do not log raw `Authorization` or passwords in application code; rely on this filter for uncaught errors only.

## Related

- Database migrations: `docs/database-production.md`
- CORS for browser clients: `docs/cors-production.md`
- AI rate limits / warn logs: `docs/ai-rate-limits.md`
- Helmet, body limits, route surface: `docs/security-hardening.md`
