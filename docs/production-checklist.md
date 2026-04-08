# Production checklist

**Deploying to a new host or domain?** Use [**go-live-verification.md**](./go-live-verification.md) for fill-in checks (CORS, health URLs, secrets on the provider).

Work through **one section at a time**; check items off when done.

---

## Must-have

### 1. Production database workflow ✓ ✓✓

- [x] Use **`prisma migrate deploy`** in the deploy pipeline (not only `migrate dev` locally). ✓✓  
      *Implemented: `npm run migrate:deploy`, committed `prisma/migrations`, manual GitHub workflow `.github/workflows/backend-migrate-deploy.yml`.*
- [x] Confirm **Supabase `DATABASE_URL`** (and any pooler URL) for production. ✓✓  
      *Documented in `docs/database-production.md`.*
- [x] Decide on **connection pooling** if you expect concurrent API traffic. ✓✓  
      *Documented (Supabase pooler / PgBouncer + Prisma notes) in `docs/database-production.md`.*
- [x] Confirm **backups** and retention with your host (Supabase project settings). ✓✓  
      *Documented in `docs/database-production.md`; confirm in your Supabase dashboard for your plan.*

---

### 2. Lock down CORS ✓ ✓✓

- [x] Replace `origin: true` in `backend/src/main.ts` with an **explicit allowlist** of origins. ✓✓  
      *Implemented: `buildAllowedCorsOrigins()` in `backend/src/cors-origins.ts` + `main.ts` origin callback.*
- [x] Include production app origins (and dev origins if needed), not a blanket `true`. ✓✓  
      *Production: **required** `CORS_ORIGINS` env (comma-separated). Dev: localhost defaults if unset; override via `CORS_ORIGINS`. Documented in `backend/.env.example` and `docs/cors-production.md`.*
- [x] Verify **web** builds still work (CORS mainly applies when the browser sends an `Origin` header). **Native** apps often use direct HTTP and may not hit CORS the same way; still validate Expo web if you ship it. ✓✓  
      *Code review: requests with **no** `Origin` are **allowed** (native). Browser `Origin` must be in the allowlist. **You should manually confirm** Expo Web against your real production URLs once deployed.*

---

### 3. Release path for the mobile app ✓ ✓✓

- [x] Add **`eas.json`** (and EAS project setup) for **EAS Build**. ✓✓  
      *Implemented: `frontend/eas.json` (preview, **staging**, production + submit + update channels). Run `npx eas-cli@latest init` in `frontend` once to link `expo.extra.eas.projectId`. Scripts: `eas:build:preview`, `eas:build:staging`, `eas:build:production`, `eas:submit`.*
- [x] Consider **EAS Update** for JavaScript-only fixes after store review. ✓✓  
      *Configured: `update` channels in `eas.json` match build channels. Runtime: install `expo-updates` and complete [EAS Update setup](https://docs.expo.dev/eas-update/getting-started/); see `docs/mobile-release.md`.*
- [x] Prepare **store listings** (screenshots, descriptions, support URL). ✓✓  
      *Checklist in `docs/mobile-release.md`. **You** complete assets in App Store Connect / Play Console.*
- [x] Publish a **privacy policy** URL required by stores. ✓✓  
      *Guidance in `docs/mobile-release.md`. **You** host the page and paste the URL into store listings.*
- [x] Ensure **API keys**: only non-secret config in `EXPO_PUBLIC_*` (it is public in the bundle); keep secrets on the server. ✓✓  
      *Documented in `frontend/.env.example` and `docs/mobile-release.md` (anon vs service role, Groq on backend only).*

---

### 4. Cost / abuse limits on AI ✓ ✓✓

- [x] Identify all routes that call **Groq** / LLM for plan or session generation. ✓✓  
      *Documented in `docs/ai-rate-limits.md`: `POST /workouts/generate`, `/workouts/preview`, `/plans/generate-sessions`, `/plans/generate-single-session`.*
- [x] Add **rate limiting** per user (and optionally per IP for anonymous flows). ✓✓  
      *`@nestjs/throttler` + `AiThrottlerGuard`: per-user tracker, IP fallback. Applied on the routes above (`AuthGuard` runs first).*
- [x] Define **quotas** (e.g. generations per day) and enforce or degrade gracefully. ✓✓  
      *Named throttlers `aiBurst` + `aiDay`; defaults and env vars in `backend/.env.example` (`AI_RATE_*`). Returns HTTP 429 when exceeded.*
- [x] Add **monitoring** (request counts, errors, latency) and alerts on cost or error spikes. ✓✓  
      *Structured **warn** logs on throttle (`AiThrottlerGuard`). **You** wire log platform → metrics/alerts; see `docs/ai-rate-limits.md`.*

---

## Strongly recommended

### 5. CI that matches reality ✓ ✓✓

- [x] Frontend: run **`jest`** in CI ✓✓  
      *`.github/workflows/frontend-ci.yml`: `npm ci` → `tsc --noEmit` → `npm test -- --ci --watchAll=false`.*
- [x] Backend: enable **`npm run test`** in CI (the Test step in `backend-ci.yml` is commented out). ✓✓  
      *Test step runs `npm test -- --ci --watchAll=false` (`--passWithNoTests` in package.json until specs exist).*
- [x] Prefer **`npm ci`** with committed **lockfiles** for reproducible installs (if you adopt lockfiles repo-wide). ✓✓  
      *Removed root `.gitignore` blanket on `package-lock.json`; committed **`frontend/package-lock.json`** and **`backend/package-lock.json`**. CI uses **`npm ci`** + **`actions/setup-node` cache** keyed by each lockfile.*

---

### 6. Backend ops basics ✓ ✓✓

- [x] Add a **`/health`** (or **`/api/health`**) endpoint for load balancers and uptime checks. ✓✓  
      *`GET /api/health` (liveness), `GET /api/health/ready` (DB `SELECT 1`). `HealthModule`.*
- [x] Use **structured logging** in production. ✓✓  
      *`NODE_ENV=production` → `JsonProductionLogger` (one JSON object per line on stdout). See `docs/backend-operations.md`.*
- [x] Run with **`NODE_ENV=production`** in deployed environments. ✓✓  
      *Documented in `docs/backend-operations.md` with `npm run start:prod`.*
- [x] Ensure errors logged to monitoring **omit sensitive data** (tokens, passwords, PII). ✓✓  
      *Global `SanitizedExceptionFilter`: logs `method` + `path` + status kind only; generic 500 body in production; stacks only in non-production.*

---

### 7. Public exercise endpoints ✓ ✓✓

- [x] **`/exercises` list/search** is unauthenticated by design; accept that or gate if needed. ✓✓  
      *Documented tradeoff in `docs/exercises-public-api.md`; gate with `AuthGuard` only if product requires it.*
- [x] Add **light rate limiting** and/or **caching** to reduce scraping and load spikes. ✓✓  
      *`catalogBurst` + `catalogDay` in `ThrottlerModule`; `ExercisesController` uses `ThrottlerGuard` and `@SkipThrottle({ aiBurst, aiDay })`. List + stats memoized at startup in `ExercisesService`.*
- [x] Document the threat model (public catalog vs. authenticated writes). ✓✓  
      *`docs/exercises-public-api.md`; env vars in `backend/.env.example` (`CATALOG_RATE_*`).*

---

### 8. Security headers / hardening ✓ ✓✓

- [x] Consider **Helmet** (or equivalent) for sensible HTTP headers. ✓✓  
      *`helmet` in `backend/src/main.ts`; CSP off for JSON API; COEP off; CORP `cross-origin`. See `docs/security-hardening.md`.*
- [x] Set **request body size limits** where appropriate. ✓✓  
      *`bodyParser: false` + explicit `body-parser` middleware; **`JSON_BODY_LIMIT`** (default `512kb`) in `backend/.env.example`.*
- [x] Audit **admin or debug** routes; disable or protect them in production. ✓✓  
      *Documented in `docs/security-hardening.md`: no admin/debug controllers; only standard modules + health.*

---

### 9. README vs code ✓ ✓✓

- [x] Align **README** with current stack (Expo version, **Groq** not OpenAI where applicable). ✓✓  
      *Root `README.md`: Expo SDK 54, Groq, Supabase; removed outdated OpenAI/rule-only LLM section.*
- [x] Keep **`.env.example`** and README in sync with real required variables. ✓✓  
      *README tables point to **`backend/.env.example`** and **`frontend/.env.example`** as source of truth; optional `PORT` / `NODE_ENV` comments added to backend example.*
- [x] Add a short **production runbook** (migrate deploy, env vars, health URL). ✓✓  
      *README section **Production runbook** + links to `docs/database-production.md`, `backend-operations`, `mobile-release`.*

---

## Nice-to-have

### 10. Crash / error reporting (client) ✓ ✓✓

- [x] Integrate e.g. **Sentry** (or similar) for the Expo app with environment tagging. ✓✓  
      *`@sentry/react-native` + `expo-constants`; `EXPO_PUBLIC_SENTRY_DSN` gates init; `EXPO_PUBLIC_APP_ENV` or dev/prod default; release `slug@version`; User id from Supabase; Metro `getSentryExpoConfig`; `app.config.js` + EAS `SENTRY_ORG` / `SENTRY_PROJECT` for plugin. See `docs/sentry-client.md`.*

---

### 11. E2E smoke tests ✓ ✓✓

- [x] Add **E2E** tests against **staging** (critical flows: sign-in, load plan, save workout). ✓✓  
      *Playwright + Expo Web: `frontend/e2e/smoke.spec.ts`, `frontend/playwright.config.ts`; `testID` hooks; optional heart save on Workout tab. Manual workflow `.github/workflows/e2e-staging.yml`. Doc: `docs/e2e-staging.md`.*

---

### 12. Staging environment ✓ ✓✓

- [x] Maintain a **staging** stack that mirrors production (DB, API URL, Supabase project optional). ✓✓  
      *Doc: `docs/staging-environment.md`. EAS: **`frontend/eas.json`** profile **`staging`** + channel `staging`; **`npm run eas:build:staging`**.*
- [x] Promote to production only after staging sign-off. ✓✓  
      *Promotion checklist and gate items in `docs/staging-environment.md` (health, migrations, critical paths, CORS/prod env, approver).*

---

## Suggested order

1 → 2 → 3 → 4 (must-have), then 5 → 6 → 9 (CI, ops, docs), then 7 → 8, then 10 → 11 → 12 as bandwidth allows.
