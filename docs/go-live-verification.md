# Go-live verification (working doc)

Use this as a **deployment-specific** checklist: confirm behavior on **your** hosts and URLs, not just in code. Check boxes as you verify; jot notes next to each section if needed.

**Related:** Implementation status and deep links → [production-checklist.md](./production-checklist.md). Env reference → `backend/.env.example`, `frontend/.env.example`.

**Last touched:** 2026-04-08

**Status snapshot:** API on Render is **live** (`GET /api/health` → 200). **JWKS / Supabase JWT verification** fixed in `backend` ([`fbe6a33`](https://github.com/deeish/Jim-App/commit/fbe6a33) — `jwks-rsa` CJS `require`). **Native app → prod API** sign-in + gated calls **verified** (2026-04-08). Optional items below (Expo Web, token-idle refresh, migrate log confirmation, rate-limit torture tests) remain for hardening or store release.

---

## How to work this doc

1. **§0** — Repo/code baseline (safe to do without a live deploy). Re-run before launch if CI, env wiring, or auth changed a lot.
2. **§§1–6** — Your **production** (or staging) environment: dashboards, real URLs, smoke tests.
3. **§7** — Sign-off when an environment is done.

---

## Current focus: §3 → §5 confirmation, then §7 sign-off

**Done (keep for future envs):** §0; §6 health URLs; **§1** public `EXPO_PUBLIC_*` wiring and prod API base for dev/prod runs; **§2** native sign-in + gated Nest calls after JWKS fix; **§4** baseline (JSON logs, `NODE_ENV`, Render logs).

**Do next (in order):**

1. **§3 Database** — In Render Dashboard → your Web Service: confirm **Pre-deploy command** is `npx prisma migrate deploy` (or you run [backend-migrate-deploy.yml](../.github/workflows/backend-migrate-deploy.yml) after deploy). Check latest deploy logs for migration success and no Prisma “pending migration” warnings.
2. **§4** — Trigger a harmless error path if needed; in **Render → Logs**, confirm you can find the line and that **`Authorization` / bodies are not** in JSON log lines (`SanitizedExceptionFilter` logs `method` + `path` only).
3. **§5** — Skim [ai-rate-limits.md](./ai-rate-limits.md); optional: hit an AI route until **429** in staging/prod to confirm throttle behavior.
4. **§2 (optional hardening)** — Supabase Auth: session/JWT lifetime settings; **redirect URLs** include `jimapp://**` ([`frontend/app.json`](../frontend/app.json) `"scheme": "jimapp"`). **Expo Web** smoke vs prod API (origin must be in `CORS_ORIGINS`). **Idle refresh** test (long background, then API call).
5. **§7** — When §§1–6 are acceptable for this environment, tick sign-off and fill the table.

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

**Checklist**

- [x] **Path exists:** Migrate on deploy is documented and wired in repo ([`render-deploy.md`](./render-deploy.md) pre-deploy step, [`render.yaml`](../render.yaml) `preDeployCommand`, optional [backend-migrate-deploy.yml](../.github/workflows/backend-migrate-deploy.yml))
- [ ] **Verified on host:** Your Render service **Pre-deploy** (or CI) actually runs **`npx prisma migrate deploy`** and latest deploy logs show success
- [ ] After deploy, schema matches expectations (no pending migrations warning in logs)
- [ ] Production **`DATABASE_URL`** points only at the **production** database
- [ ] If using Supabase **pooler** / PgBouncer: connection string and Prisma notes in `database-production.md` are followed
- [ ] **Backups** on for the prod project; retention is acceptable for your risk tolerance
- [ ] Optional **restore drill**: restore to a scratch DB or read Supabase restore flow — date tried: _…_

---

## 4. Errors & logging

**Fill in**

- Where we read logs: **Render** → Web Service → **Logs**

**Checklist**

- [x] Deployed API has **`NODE_ENV=production`** — see [backend-operations.md](./backend-operations.md)
- [x] Log output is **JSON lines** to stdout (or your platform captures it correctly)
- [x] Logs are shipped to somewhere **searchable** (host UI, Datadog, etc.) _(Render Logs UI)_
- [ ] You can find recent **5xx** or `unhandled` lines after a test error
- [x] Spot-check (code + sample logs): **`SanitizedExceptionFilter`** logs JSON lines with **`kind`**, **`status`**, **`method`**, **`path`**, **`ts`** only — not bodies, **`Authorization`**, or cookies ([`sanitized-exception.filter.ts`](../backend/src/common/sanitized-exception.filter.ts))
- [ ] **Deploy failures** notify someone (host email/Slack, GitHub Actions, etc.)

---

## 5. Rate limits & abuse

Throttle config: `backend/src/app.module.ts`; details in [ai-rate-limits.md](./ai-rate-limits.md) and `backend/.env.example` (`AI_RATE_*`, `CATALOG_RATE_*`).

**Fill in**

- Chosen / confirmed prod values (optional): _…_

**Checklist**

- [ ] **AI** routes (plan/workout generation) return **429** when you exceed limits in staging or prod
- [ ] 429 responses are acceptable for the product (copy / retry UX on client if needed)
- [ ] Public **`/exercises`** traffic: **`catalogBurst`** / **`catalogDay`** feel right for prod (not too loose / tight)
- [ ] Production **`AI_RATE_*`** and **`CATALOG_RATE_*`** reviewed; overrides documented if not default
- [ ] **Login / signup** abuse: Supabase Dashboard — rate limits, CAPTCHA, or hooks considered if you expect noise
- [ ] Known expensive endpoints are covered (re-read `ai-rate-limits.md` route list vs your product)

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
