# Public exercise catalog API

The exercise catalog is served from in-memory data derived from `data/exercises_5000plus.json` (plus optional `data/exercise-videos.json`). Several routes are **intentionally unauthenticated** so the mobile app can browse and search without signing in.

## Routes

| Auth | Method | Path | Purpose |
|------|--------|------|--------|
| Public | `GET` | `/api/exercises` | Full list (large payload) |
| Public | `POST` | `/api/exercises/search` | Filtered / text search |
| Public | `GET` | `/api/exercises/search` | Same as POST, query params |
| Public | `GET` | `/api/exercises/stats` | Aggregate counts |
| Public | `GET` | `/api/exercises/:id` | Single exercise |
| Required | `GET` | `/api/exercises/saved`, … | Saved library reads/writes |

Global API prefix is `/api` (see backend bootstrap).

## Threat model

- **Public read**: Anyone who can reach the API can pull the catalog shape and content. That is acceptable if you treat the catalog as **non-secret reference data** (names, muscle groups, equipment tags). It does **not** grant access to user workouts, plans, or Groq usage.
- **Authenticated writes**: Saving exercises to a user profile uses `AuthGuard` and persists via Prisma; those operations are **not** covered by the public catalog policy.
- **Scraping / load**: A client could hammer list/search endpoints. Mitigations:
  - **Rate limits** `catalogBurst` and `catalogDay` (per IP, default `ThrottlerGuard` on the exercises controller). AI limits (`aiBurst` / `aiDay`) are **skipped** on this controller so normal browsing does not consume Groq quotas.
  - **Memoization**: Full list and stats are computed once at process startup to keep CPU steady under legitimate traffic.

If you ever need to **hide** the catalog behind login, you would add `AuthGuard` to the public handlers (or serve a reduced dataset) and update clients accordingly.

## Configuration

Backend env (see `backend/.env.example`):

| Variable | Default | Meaning |
|----------|---------|--------|
| `CATALOG_RATE_BURST_MAX` | `120` | Max catalog requests in the burst window |
| `CATALOG_RATE_BURST_WINDOW_MS` | `60000` | Burst window (ms) |
| `CATALOG_RATE_DAY_MAX` | `3000` | Max catalog requests in the day window |
| `CATALOG_RATE_DAY_WINDOW_MS` | `86400000` | Day window (ms) |

Throttled clients receive **429 Too Many Requests**.

## Related

- Groq / AI limits: `docs/ai-rate-limits.md` (different throttler names and routes).
