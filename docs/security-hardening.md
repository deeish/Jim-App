# Backend security hardening

Applies to the NestJS HTTP API (`backend/`). Goal: sensible defaults for a **JSON API** (not HTML pages).

## HTTP headers (Helmet)

[Helmet](https://helmetjs.github.io/) runs as Express middleware in `backend/src/main.ts`.

For an API-only server, **Content-Security-Policy** is disabled (CSP targets document loads). **Cross-Origin-Embedder-Policy** is disabled to avoid breaking cross-origin clients. **Cross-Origin-Resource-Policy** is set to **`cross-origin`** so CORS-based browser clients are not blocked by default Helmet CORP behavior on JSON responses.

Other Helmet middlewares (e.g. `X-Content-Type-Options`, `X-DNS-Prefetch-Control`, framing protections) still apply.

## Request body size

Nest’s default body parser is replaced with explicit **body-parser** middleware so limits are controlled:

| Env | Default | Meaning |
|-----|---------|--------|
| `JSON_BODY_LIMIT` | `512kb` | Max JSON and URL-encoded body size (string accepted by [bytes](https://www.npmjs.com/package/bytes), e.g. `1mb`). |

Very large workout payloads should stay under this limit; raise only if needed and traffic is trusted.

## Route audit (admin / debug)

There are **no** separate admin or debug HTTP controllers in this codebase. Exposed controllers (all under prefix `/api`):

| Area | Controller | Notes |
|------|------------|--------|
| Health | `health` | Public liveness/readiness |
| Exercises | `exercises` | Public catalog + auth for saved exercises |
| Workouts | `workouts` | Auth + AI throttling on generator routes |
| Plans | `plans` | Auth + AI throttling on generator routes |
| Workout logs | `workout-logs` | Auth |

Operational scripts are under `backend/scripts/` and **do not** start HTTP servers. NPM scripts like `start:debug` / `test:debug` are local developer tooling only.

## Related

- Production error sanitization and logging: `docs/backend-operations.md`
- CORS allowlist: `docs/cors-production.md`
