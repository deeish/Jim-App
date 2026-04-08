# Go-live verification (working doc)

Use this as a **deployment-specific** checklist: confirm behavior on **your** hosts and URLs, not just in code. Check boxes as you verify; jot notes next to each section if needed.

**Related:** Implementation status and deep links → [production-checklist.md](./production-checklist.md). Env reference → `backend/.env.example`, `frontend/.env.example`.

**Last touched:** 2026-04-08 _(§4 HTTP smoke + §5 defaults documented below)_

**Status snapshot:** API on Render is **live** (`GET /api/health` → 200). **JWKS / Supabase JWT verification** fixed ([`fbe6a33`](https://github.com/deeish/Jim-App/commit/fbe6a33)). **Native app → prod API** sign-in + gated calls **verified** (2026-04-08). **§4** prod **401** smoke without token **verified** (2026-04-08). **§5** throttle defaults + route list documented in-file. Still optional: Render log line confirmation, **429** burst test, Expo Web, migrate deploy log tick, **§7** sign-off.

---

## How to work this doc

1. **§0** — Repo/code baseline (safe to do without a live deploy). Re-run before launch if CI, env wiring, or auth changed a lot.
2. **§§1–6** — Your **production** (or staging) environment: dashboards, real URLs, smoke tests.
3. **§7** — Sign-off when an environment is done.

---

## Current focus: §7 sign-off + optional follow-ups

**Done (keep for future envs):** §0; §6 health URLs; **§1** public `EXPO_PUBLIC_*` + prod API; **§2** native auth + gated API; **§3** `/api/health/ready` runtime DB proof; **§4** baseline logging + **401 smoke curl** (§4); **§5** throttle defaults documented + route list aligned with code/docs.

**Do next (in order):**

1. **§3 (dashboard)** — If not done: Render **Pre-deploy** + deploy logs for `prisma migrate deploy`.
2. **§4 (dashboard)** — After running the §4 curl against prod, open **Render → Logs** and confirm one **`http_exception`** line for `/api/plans/me/with-weekly` with **no** `Authorization` / body payload.
3. **§5 (optional)** — With a **valid bearer** on staging/local, burst `POST` an AI route (see [ai-rate-limits.md](./ai-rate-limits.md)) until **429**; check logs for `AI rate limit exceeded`. Tune **`AI_RATE_*`** / **`CATALOG_RATE_*`** on Render if needed.
4. **§2 (optional)** — Supabase JWT/session + **redirect URLs** (`jimapp://**`); Expo Web + **CORS**; idle token refresh.
5. **§7** — Sign-off table when you accept remaining open boxes or note them as **accepted risk**.

---

## Progress log

| Date       | What |
|------------|------|
| 2026-04-07 | **§0 complete:** `.env` ignored in root + `backend/` + `frontend/`; grep over `backend/src` / `frontend/src` found no embedded secrets (only normal `config` / env usage); API base from `EXPO_PUBLIC_API_BASE` in `frontend/src/config/api.ts`; migration workflow present. **Next:** deploy API; fill URL fields in §§1–2 and §6; run §§1–6 against live stack. |
| 2026-04-07 | **Hosting choice:** API on **Render** — follow [render-deploy.md](./render-deploy.md) (optional [render.yaml](../render.yaml) Blueprint). |
| 2026-04-08 | **Render:** Web Service live; env vars set (`NODE_*`, `DATABASE_URL`, Supabase, `CORS_ORIGINS`). Build uses `NPM_CONFIG_PRODUCTION=false npm ci …`. Primary URL: **`https://jim-app-l8o7.onrender.com`** (change if your service name differs). **Next:** push repo (root `/` handler in `main.ts`, `package-lock.json` after `npm audit fix`, doc tweaks), set **`EXPO_PUBLIC_API_BASE`** to this origin on builds that should hit prod, manually tick §§1–6 after smoke tests (health, `/ready`, sign-in, gated API). |
| 2026-04-08 | **Git:** pushed `118430d` to **`origin/main`** (Render deploy guide, `go-live-verification`, `main.ts` root + HEAD `/`, backend lockfile/`engines`). **Now:** wait for Render **auto-deploy** (if enabled) or **Manual Deploy** → confirm §6 health URLs → set **`EXPO_PUBLIC_API_BASE=https://jim-app-l8o7.onrender.com`** for prod-targeted app runs → finish §§1–2 smoke tests. |
| 2026-04-08 | **§6 verified:** `GET /api/health` → `{"status":"ok","service":"jim-api",…}`; `GET /api/health/ready` → `{"status":"ready",…}` on **`https://jim-app-l8o7.onrender.com`**. |
| 2026-04-08 | **Auth bugfix:** JWKS client failed (`jwks-rsa` default import under CommonJS). Fixed with `import jwksRsa = require('jwks-rsa')` in [`auth.service.ts`](../backend/src/auth/auth.service.ts); pushed **`fbe6a33`**. Redeploy Render (auto or manual). |
| 2026-04-08 | **§2 native smoke:** After restart/rebuild, prod API accepts Supabase access token; gated routes (**e.g.** `GET /api/plans/me/with-weekly`) succeed from the app. |
| 2026-04-08 | **§6 re-check:** `GET https://jim-app-l8o7.onrender.com/api/health` → **200**. |
| 2026-04-08 | **§3 runtime:** `GET https://jim-app-l8o7.onrender.com/api/health/ready` → **200**, body `status: ready` — deployed API reaches Postgres. **Still confirm** Pre-deploy migrate logs on Render when convenient. |
| 2026-04-08 | **§4 smoke:** `GET /api/plans/me/with-weekly` without auth on prod → **401** (curl). **Still confirm** matching `http_exception` JSON line in Render logs. |
| 2026-04-08 | **§5 review:** Throttle defaults and AI routes cross-checked vs [`app.module.ts`](../backend/src/app.module.ts), [`ai-rate-limits.md`](./ai-rate-limits.md), `plans`/`workouts` + public `exercises` (`catalogBurst` / `catalogDay`). |

---

## 0. Repository baseline (no live host required)

- [x] **`.env` / `.env.local` / `.env.*.local`** are listed in `.gitignore` for **root**, **`backend/`**, and **`frontend/`**
- [x] **No secrets in app source:** `backend/src` and `frontend/src` spot-check (variable *names* in docs/README only; Groq stays backend `config`, frontend mentions are UI/cache comments only)
- [x] **Public client config:** `frontend/src/config/api.ts` reads **`EXPO_PUBLIC_API_BASE`** only; if unset, defaults to `http://localhost:3000` for local dev (`frontend/.env.example` describes prod)
- [x] **Migrations CI hook exists:** [`.github/workflows/backend-migrate-deploy.yml`](../.github/workflows/backend-migrate-deploy.yml) — manual **`workflow_dispatch`**, `DATABASE_URL` from repo **Secrets** → `npx prisma migrate deploy` in `backend/`
- [x] Optional: **`git log -p -- '*.env'`** on a trusted machine before first prod deploy _(2026-04-08: no tracked `.env` at repo/frontend/backend paths in recent history)_

---

## 1. Secrets & config

**Fill in**

- Our production API base URL: **`https://jim-app-l8o7.onrender.com`** _(no `/api`; update if your Render hostname changed)_
- Our production web / Expo web origin(s): _add when shipped (e.g. Vercel); Expo Web dev uses localhost origins in `CORS_ORIGINS`_

**Checklist**

- [x] `.env` and real secrets are **gitignored** and never committed _(see §0)_
- [x] Quick scan: no API keys, `DATABASE_URL`, or service role keys in **application source** (`backend/src`, `frontend/src`) _(see §0; still run optional git history check below)_
- [x] Optional: spot-check history — `git log -p -- '*.env'` (or your host’s secret-scan tool) _(light check 2026-04-08)_
- [x] Production secrets live only on the host / secret manager (not in the repo) _(Render env; not in git)_
- [ ] Production `DATABASE_URL`, Supabase keys, and Groq (if used) **differ** from local dev _(optional; OK if same Supabase project while hobby-testing)_
- [ ] Prefer a **separate** Supabase project (or distinct keys) for production vs dev
- [x] Frontend: every `EXPO_PUBLIC_*` value is OK to be **public** (no service_role, no LLM keys) — design + [`frontend/.env.example`](../frontend/.env.example); **re-confirm on EAS / store pipeline** before public release
- [x] Frontend build/run against prod **`EXPO_PUBLIC_API_BASE`** verified _(2026-04-08: `https://jim-app-l8o7.onrender.com`; gated API OK)_
- [x] Same run uses prod Supabase **`EXPO_PUBLIC_SUPABASE_URL`** + **`EXPO_PUBLIC_SUPABASE_ANON_KEY`** matching the backend project _(required for working login; re-confirm for each release channel)_
- [x] Groq / LLM keys exist **only** on the backend environment _(never in Expo `EXPO_PUBLIC_*`; set on Render only if used)_
- [x] User-facing API is served over **HTTPS** (TLS at host or reverse proxy) _(Render `onrender.com`)_
- [ ] Any marketing or Expo Web surface users hit is **HTTPS** _(when you add Vercel etc.)_

---

## 2. Auth & CORS

Auth is **Supabase** (issue + refresh JWT); the Nest API **verifies** the access token.

**Fill in**

- `CORS_ORIGINS` in production (redact if you copy this elsewhere): _localhost Expo Web for now; add Vercel `https://…` when ready_

**Checklist**

- [ ] In Supabase Dashboard → Auth, **JWT / session** settings match what you want (access lifetime, refresh behavior)
- [ ] Supabase **redirect URLs** include **`jimapp://**`** ([`frontend/app.json`](../frontend/app.json) scheme) and any Expo dev / web origins you use for magic link or password reset
- [x] On a **production-pointing** mobile run: **sign-in** and a **gated API call** succeed _(2026-04-08, after JWKS fix + Render deploy)_
- [ ] **Sign-out** smoke (if you expose it): session cleared as expected
- [ ] Same build after idle / near token expiry: **refresh** still works (no mystery 401s)
- [x] **`CORS_ORIGINS`** is set on the backend for `NODE_ENV=production` (app won’t start without it)
- [x] Every **browser** origin that calls the API is in **`CORS_ORIGINS`** (Expo Web, hosted web) _(Expo Web dev origins set; expand when you ship web on Vercel)_
- [x] Read [cors-production.md](./cors-production.md); behavior matches code (**allowlist**; native often has no `Origin`) _(reviewed 2026-04-08)_
- [x] **Native** app smoke vs prod API _(2026-04-08)_
- [ ] **Expo Web** smoke test against prod API (`Origin` must be allowlisted)

---

## 3. Database

**Quick check (no dashboard):**

```bash
curl -sS "https://jim-app-l8o7.onrender.com/api/health/ready"
```

Expect **200** and JSON including `"status":"ready"` when the API’s `DATABASE_URL` is reachable.

**Checklist**

- [x] **Path exists:** Migrate on deploy is documented and wired in repo ([`render-deploy.md`](./render-deploy.md) pre-deploy step, [`render.yaml`](../render.yaml) `preDeployCommand`, optional [backend-migrate-deploy.yml](../.github/workflows/backend-migrate-deploy.yml))
- [ ] **Verified on host:** Your Render service **Pre-deploy** (or CI) actually runs **`npx prisma migrate deploy`** and latest deploy logs show success
- [x] **Runtime:** Production **`GET /api/health/ready`** succeeds (`status: ready`) — API can open a DB connection _(2026-04-08)_
- [ ] After deploy, schema matches expectations (no pending migrations warning in logs) — _strong signal: authenticated Prisma routes work; still confirm deploy logs or `prisma migrate status` against prod DB when convenient_
- [ ] Production **`DATABASE_URL`** points only at the **production** database
- [ ] If using Supabase **pooler** / PgBouncer: connection string and Prisma notes in `database-production.md` are followed
- [ ] **Backups** on for the prod project; retention is acceptable for your risk tolerance
- [ ] Optional **restore drill**: restore to a scratch DB or read Supabase restore flow — date tried: _…_

---

## 4. Errors & logging

**Fill in**

- Where we read logs: **Render** → Web Service → **Logs**

**Quick check (safe 401, no secrets in log body):** Call a gated route without a token, then search logs for `http_exception` + that path.

```bash
curl -sS -o NUL -w "%{http_code}" "https://jim-app-l8o7.onrender.com/api/plans/me/with-weekly"
```

Expect **401**; log line should look like `{"level":"warn","kind":"http_exception","status":401,"method":"GET","path":"/api/plans/me/with-weekly",...}` — no `Authorization` value. _(Verified **401** from prod curl 2026-04-08.)_

**Checklist**

- [x] Deployed API has **`NODE_ENV=production`** — see [backend-operations.md](./backend-operations.md)
- [x] Log output is **JSON lines** to stdout (or your platform captures it correctly)
- [x] Logs are shipped to somewhere **searchable** (host UI, Datadog, etc.) _(Render Logs UI)_
- [ ] **Render:** Search logs for **`http_exception`** + **`/api/plans/me/with-weekly`** after the curl above; confirm line matches filter shape (no secrets) _(HTTP 401 verified 2026-04-08)_
- [ ] You can find recent **5xx** or `unhandled` lines after a test error _(optional: force an internal error only in a safe environment)_
- [x] Spot-check (code + sample logs): **`SanitizedExceptionFilter`** logs JSON lines with **`kind`**, **`status`**, **`method`**, **`path`**, **`ts`** only — not bodies, **`Authorization`**, or cookies ([`sanitized-exception.filter.ts`](../backend/src/common/sanitized-exception.filter.ts))
- [ ] **Deploy failures** notify someone (host email/Slack, GitHub Actions, etc.)

---

## 5. Rate limits & abuse

Throttle config: [`backend/src/app.module.ts`](../backend/src/app.module.ts); details in [ai-rate-limits.md](./ai-rate-limits.md) and `backend/.env.example` (`AI_RATE_*`, `CATALOG_RATE_*`).

**Fill in — defaults when env vars unset** (from `useFactory` in [`app.module.ts`](../backend/src/app.module.ts); override on Render if needed):

| Throttler | Limit | Window |
|-----------|------:|--------|
| **`aiBurst`** | 12 | 60_000 ms (1 min) |
| **`aiDay`** | 120 | 86_400_000 ms (24 h) |
| **`catalogBurst`** | 120 | 60_000 ms |
| **`catalogDay`** | 3000 | 86_400_000 ms |

**AI-backed HTTP routes** (after auth; `AiThrottlerGuard`): `POST /api/workouts/generate`, `POST /api/workouts/preview`, `POST /api/plans/generate-sessions`, `POST /api/plans/generate-single-session` — see [ai-rate-limits.md](./ai-rate-limits.md). **Public catalog:** `/api/exercises` uses default `ThrottlerGuard` with **`catalogBurst` / `catalogDay`** only (AI buckets skipped in [`exercises.controller.ts`](../backend/src/exercises/exercises.controller.ts)).

**Checklist**

- [ ] **AI** routes (plan/workout generation) return **429** when you exceed limits in staging or prod _(optional burst test with valid JWT)_
- [ ] 429 responses are acceptable for the product (copy / retry UX on client if needed)
- [ ] Public **`/exercises`** traffic: **`catalogBurst`** / **`catalogDay`** feel right for prod (not too loose / tight)
- [x] Production **`AI_RATE_*`** and **`CATALOG_RATE_*`** defaults documented above; set on Render only when overriding _(reviewed 2026-04-08)_
- [ ] **Login / signup** abuse: Supabase Dashboard — rate limits, CAPTCHA, or hooks considered if you expect noise
- [x] Known expensive endpoints are covered — table in [ai-rate-limits.md](./ai-rate-limits.md) matches controllers _(2026-04-08)_

---

## 6. Health checks

Global prefix **`/api`**.

**Fill in**

- Liveness URL: **`https://jim-app-l8o7.onrender.com/api/health`**
- Ready URL: **`https://jim-app-l8o7.onrender.com/api/health/ready`**

**Checklist**

- [x] **`GET /api/health`** returns 200 from outside (curl, browser, uptime monitor)
- [x] Response is JSON with `status: ok` (and you’re OK exposing service name / timestamp)
- [x] **`GET /api/health/ready`** returns 200 when DB is up
- [ ] **`/api/health/ready`** fails or errors appropriately when DB is down (if you test that scenario)
- [x] Host health check uses **liveness** path **`/api/health`** _(set in [`render.yaml`](../render.yaml) `healthCheckPath`; mirror in Render UI if needed)_
- [ ] If the platform supports it, **readiness** (`/api/health/ready`) gates traffic when DB must be up

---

## 7. Sign-off

- [ ] Sections 1–6 reviewed for this environment _(list any open items above as “accepted risk” or schedule follow-up)_
- [ ] Notes copied to runbook or [staging-environment.md](./staging-environment.md) if useful for the team

| Role   | Name | Date |
|--------|------|------|
| Verified |      |      |

When this page is stable, keep a blank copy or duplicate file per environment (e.g. prod vs staging).
