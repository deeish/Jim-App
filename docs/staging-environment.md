# Staging environment

Use a **staging** stack to validate releases with production-like settings **before** touching production users and data.

## What “mirrors production” means

| Layer | Staging should… |
|--------|-------------------|
| **Backend** | Same codebase branch you intend to ship (e.g. `main` after merge). **`NODE_ENV=production`**, same Nest build/startup as prod (`npm run build` → `npm run start:prod`). |
| **Database** | **Separate** Postgres / Supabase project (recommended), or a dedicated database within the same host — **never** point staging at the production `DATABASE_URL`. Run the **same** Prisma migrations as production (`npm run migrate:deploy`). |
| **Auth** | Separate Supabase project **or** same project with isolated DB: JWT secret **`SUPABASE_JWT_SECRET`** must match the Supabase project used for **`SUPABASE_URL`**. Anon key in the app must match that project. |
| **API URL** | Stable HTTPS origin (e.g. `https://api-staging.example.com`) listed in the **staging** app’s **`EXPO_PUBLIC_API_BASE`**. |
| **CORS** | Backend **`CORS_ORIGINS`** includes staging **browser** origins (Expo Web preview URL, internal web app host, etc.). Native apps often send no `Origin`; still verify Expo Web if you use it. |
| **Groq** | Use a real **`GROQ_API_KEY`** (can be the same key as prod or a separate key for quota isolation). Staging should exercise AI paths like production. |
| **Limits / ops** | Same **`AI_RATE_*`**, **`CATALOG_RATE_*`**, **`JSON_BODY_LIMIT`**, Helmet, structured logging as production unless you **explicitly** relax limits for load testing (document any differences). |

**Optional second Supabase project** keeps staging users, auth emails, and RLS data fully separate from production.

## Frontend builds

- **Expo / EAS**: use the **`staging`** profile in **`frontend/eas.json`** (internal distribution, update channel `staging`). Set staging **`EXPO_PUBLIC_*`** via EAS env or `eas secret` so binaries talk to the staging API and Supabase.
- Set **`EXPO_PUBLIC_APP_ENV=staging`** (or use the default `production` when `EXPO_PUBLIC_APP_ENV` is unset on staging builds — see **`docs/sentry-client.md`**) so Sentry and logs distinguish staging from production.

## E2E

Point **Playwright** at the deployed **staging Web** URL and staging test user; see **`docs/e2e-staging.md`** and `.github/workflows/e2e-staging.yml`.

## Promotion / sign-off (production gate)

Do **not** deploy to production until staging checks pass and an owner signs off.

**Suggested gate checklist:**

1. [ ] Staging backend health: **`GET /api/health`**, **`GET /api/health/ready`** on staging URL.  
2. [ ] Migrations applied on staging DB; schema matches the release commit.  
3. [ ] Critical paths exercised on staging: sign-in, load plan, workout session / save (manual or E2E).  
4. [ ] No open **P0/P1** issues for this release on staging.  
5. [ ] **`CORS_ORIGINS`** and production **`EXPO_PUBLIC_API_BASE`** updated in a **separate** prod config (not reused verbatim from staging if origins differ).  
6. [ ] Production **`migrate:deploy`** plan reviewed (backup / maintenance window if needed).  
7. [ ] **Named approver** (e.g. maintainer) records sign-off (ticket, PR comment, or change log).

After promotion, monitor production logs and Sentry (if enabled) for the first release window.

## Related

- Production runbook: **`README.md`** (Production runbook section)  
- Database / migrations: **`docs/database-production.md`**  
- CORS: **`docs/cors-production.md`**  
- Mobile / EAS: **`docs/mobile-release.md`**
