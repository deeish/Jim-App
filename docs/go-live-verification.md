# Go-live verification (working doc)

Use this as a **deployment-specific** checklist: confirm behavior on **your** hosts and URLs, not just in code. Check boxes as you verify; jot notes next to each section if needed.

**Related:** Implementation status and deep links → [production-checklist.md](./production-checklist.md). Env reference → `backend/.env.example`, `frontend/.env.example`.

**Last touched:** 2026-04-08 _(§5 optional 429 verification steps)_

**Status snapshot:** API on Render is **live**. **§5** how-to for **429** tests added (**catalog** = no LLM; **AI** = prefer local to avoid Groq cost). Prior **§3/§4** Render steps unchanged. Next: run §5 optional tests if desired → **§7** sign-off.

---

## How to work this doc

1. **§0** — Repo/code baseline (safe to do without a live deploy). Re-run before launch if CI, env wiring, or auth changed a lot.
2. **§§1–6** — Your **production** (or staging) environment: dashboards, real URLs, smoke tests.
3. **§7** — Sign-off when an environment is done.

---

## Current focus: §5 optional → §7 sign-off

**Done (keep for future envs):** §0; §6; **§1** client + prod API; **§2** native auth + CORS curl + quick-action text; **§3** `/ready` + Render migrate cookbook; **§4** 401 curl + Render log cookbook; **§5** defaults + **optional 429** procedures below.

**Do next (in order):**

1. **§3 / §4** — If not ticked yet: complete **Render** migrate + log steps in §3–§4.
2. **§2 (Supabase)** — If not done: **Quick actions** in **§2**.
3. **§5 (optional)** — See **Optional: prove 429** in §5 (catalog burst on prod/staging; AI throttle preferably **local**).
4. **§7** — Sign-off or **accepted risk** using the roll-up table.

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
| 2026-04-08 | **§2 CORS (prod):** `GET /api/health` with `Origin: http://localhost:19006` → **200** and `access-control-allow-origin: http://localhost:19006` — Expo Web dev origin allowlisted on deployed API. |
| 2026-04-08 | **Docs:** Added Render UI walkthroughs for **§3** (Pre-Deploy / migrate log search) and **§4** (live log search after 401 curl). |
| 2026-04-08 | **§5:** Documented optional **429** checks — **catalog** (`GET /api/exercises/stats`, no LLM) vs **AI** routes (prefer **local** + low `AI_RATE_BURST_MAX` to avoid many Groq calls on prod). |

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

- `CORS_ORIGINS` in production (redact if you copy this elsewhere): _must include each browser **Origin** that calls the API (e.g. Expo Web dev `http://localhost:19006`); prod curl 2026-04-08 confirmed that origin is mirrored on **`GET /api/health`**_

**Quick actions (Supabase Dashboard)**

1. **Authentication → URL configuration**  
   - **Site URL:** your primary return target (often the custom scheme or web URL Supabase should default to).  
   - **Redirect URLs:** add at least **`jimapp://**`** — matches [`frontend/app.json`](../frontend/app.json) `"scheme": "jimapp"`.  
   - Add **Expo Go / dev** patterns if you use magic link or password reset from dev (see comments in [`frontend/.env.example`](../frontend/.env.example)).
2. **Authentication → Settings (or Providers)** — Review **JWT expiry** and refresh behavior vs product expectations.
3. After saving, retry **forgot password** / magic link from the app once to confirm the redirect lands in-app.

**Expo Web vs prod API (CORS sanity, no app required)**

```bash
curl.exe -sS -D - -o NUL -H "Origin: http://localhost:19006" "https://jim-app-l8o7.onrender.com/api/health"
```

Expect **200** and response headers including **`access-control-allow-origin: http://localhost:19006`**. _(Verified 2026-04-08 against current Render `CORS_ORIGINS`.)_

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
- [x] **CORS:** Browser `Origin: http://localhost:19006` is mirrored on prod **`GET /api/health`** _(curl 2026-04-08; requires that origin in Render `CORS_ORIGINS`)_
- [ ] **Expo Web** app run: sign-in + gated API against prod (full UX, not only CORS headers)

---

## 3. Database

**Quick check (no dashboard):**

```bash
curl -sS "https://jim-app-l8o7.onrender.com/api/health/ready"
```

Expect **200** and JSON including `"status":"ready"` when the API’s `DATABASE_URL` is reachable.

**Render dashboard (migrations)**

1. Open [Render Dashboard](https://dashboard.render.com) → select this **Web Service** (API).
2. **Settings** (left nav) → scroll to **Pre-Deploy Command**.  
   - **Recommended:** `npx prisma migrate deploy` (see [render-deploy.md](./render-deploy.md) §1).  
   - If this is **empty**, migrations must run via [backend-migrate-deploy.yml](../.github/workflows/backend-migrate-deploy.yml) or another documented process — note that in §7 if so.
3. **Events** (or **Deploys**) → open the **latest successful** deploy.
4. In the deploy log text, search (**Ctrl+F**) for: `prisma migrate`, `migrate deploy`, `Applied`, or `No pending migrations`.  
   - Success usually shows Prisma applying or reporting migrations up to date.  
   - Failures often mention `P3009`, pending migrations, or DB connection errors — fix before sign-off.
5. Optional: compare migration folder names in [`backend/prisma/migrations`](../backend/prisma/migrations) to what you expect for this release.

**Checklist**

- [x] **Path exists:** Migrate on deploy is documented and wired in repo ([`render-deploy.md`](./render-deploy.md) pre-deploy step, [`render.yaml`](../render.yaml) `preDeployCommand`, optional [backend-migrate-deploy.yml](../.github/workflows/backend-migrate-deploy.yml))
- [ ] **Verified on host:** Your Render service **Pre-deploy** (or CI) actually runs **`npx prisma migrate deploy`** and latest deploy logs show success _(use **Render dashboard (migrations)** above)_
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

**Render dashboard (logs)**

1. Open the same Web Service → **Logs** (live runtime logs).
2. In a terminal, run the **curl** above (401 request) so the service emits a line.
3. In the Render log viewer, **search** for `http_exception` or `with-weekly`.
4. Confirm one JSON line includes `"kind":"http_exception"`, `"status":401`, `"path":"/api/plans/me/with-weekly"` (or suffix), and does **not** include a bearer token or request body.

**Checklist**

- [x] Deployed API has **`NODE_ENV=production`** — see [backend-operations.md](./backend-operations.md)
- [x] Log output is **JSON lines** to stdout (or your platform captures it correctly)
- [x] Logs are shipped to somewhere **searchable** (host UI, Datadog, etc.) _(Render Logs UI)_
- [ ] **Render:** Search logs for **`http_exception`** + **`/api/plans/me/with-weekly`** after the curl above; confirm line matches filter shape (no secrets) _(HTTP **401** verified 2026-04-08; use **Render dashboard (logs)** above)_
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

**Optional: prove 429 (throttler works)**

1. **Catalog burst (no auth, no LLM)** — Uses **`catalogBurst`** default **120** requests / **60 s** to **`GET /api/exercises/stats`**. Send several dozen requests **inside one minute** until some return **429**.  
   - **Caution:** Spares Groq but still loads the API; prefer **staging** / **local** if you can mirror prod config, and avoid pointless hammering of a **free** production instance.  
   - **PowerShell (125 quick hits):**

   ```powershell
   1..125 | ForEach-Object { curl.exe -sS -o NUL -w "%{http_code} " "https://jim-app-l8o7.onrender.com/api/exercises/stats" }; ""
   ```

   Expect mostly **200**, then **429** once the burst bucket is exceeded (exact count depends on timing vs the 60 s window).

2. **AI burst (needs JWT)** — `AiThrottlerGuard` uses **`aiBurst`** (**12** / minute by default). **Each successful call still runs the workout/plan generator** (may call **Groq**). Repeating **POST** to e.g. `/api/workouts/preview` a dozen times on **production** can waste quota and money. **Preferred:** on **localhost**, set **`AI_RATE_BURST_MAX=2`** (and **`AI_RATE_BURST_WINDOW_MS=60000`**) in `backend/.env`, restart the API, obtain a valid **`Authorization: Bearer &lt;access_token&gt;`**, then issue **4** quick **`POST`**s with body **`{}`** to **`http://localhost:3000/api/workouts/preview`** and header **`Authorization: Bearer <your Supabase access_token>`** — expect **429** once the burst limit is exceeded (first requests may still invoke Groq). **Render logs** for production AI throttling show: `AI rate limit exceeded:` ([`ai-throttler.guard.ts`](../backend/src/common/ai-throttler.guard.ts)).

**Checklist**

- [ ] **AI** routes (plan/workout generation) return **429** when you exceed limits in staging or prod _(optional: **local** test above; avoid mass AI calls on prod)_
- [ ] 429 responses are acceptable for the product (copy / retry UX on client if needed)
- [ ] Public **`/exercises`** traffic: **`catalogBurst`** / **`catalogDay`** feel right for prod (not too loose / tight) _(optional: **catalog** 429 probe above)_
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

**Open items roll-up** (unchecked boxes as of last doc pass — re-scan before sign-off):

| Area | Still open (typical) |
|------|----------------------|
| §1 | Separate prod Supabase / key rotation; marketing **HTTPS** when you ship web landing |
| §2 | Supabase JWT + **redirect URLs** confirmation; sign-out; idle refresh; **Expo Web** full app smoke |
| §3 | Render **Pre-deploy** migrate log proof; schema/pooler/backups/restore drill |
| §4 | **`http_exception`** line in Render logs; optional **5xx** spot-check; deploy **notifications** |
| §5 | **429** burst test; client **429** UX; catalog limits “feel”; Supabase **auth abuse** settings |
| §6 | **`/ready`** when DB down; LB **readiness** gating if supported |

Treat any row you skip as **accepted risk** or file a follow-up ticket.

---

- [ ] Sections 1–6 reviewed for this environment _(list any open items above as “accepted risk” or schedule follow-up)_
- [ ] Notes copied to runbook or [staging-environment.md](./staging-environment.md) if useful for the team

| Role   | Name | Date |
|--------|------|------|
| Verified |      |      |

When this page is stable, keep a blank copy or duplicate file per environment (e.g. prod vs staging).
