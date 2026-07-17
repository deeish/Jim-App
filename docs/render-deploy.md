# Deploy the API on Render

Use a **Web Service** pointed at this repo with **root directory** `backend`. Keep **PostgreSQL on Supabase** (or elsewhere); only the NestJS process runs on Render.

**See also:** [`backend/.env.example`](../backend/.env.example), [`cors-production.md`](./cors-production.md), [`database-production.md`](./database-production.md), [`go-live-verification.md`](./go-live-verification.md).

**Last reviewed:** 2026-04-07

---

## 1. Create the Web Service

1. Render Dashboard → **New** → **Web Service** → connect this Git repository.
2. **Root directory:** `backend`
3. **Runtime:** Node
4. **Build command:**  
   `NPM_CONFIG_PRODUCTION=false npm ci && npx prisma generate && npm run build`  
   *Render sets `NODE_ENV=production`, which makes `npm ci` skip `devDependencies` by default—but the Nest CLI, TypeScript, and Prisma CLI live there, so we force dev deps for install only.*
5. **Start command:**  
   `npm run start:prod`  
   (runs `node dist/src/main`; listens on Render’s **`PORT`**, which the app already reads.)
6. **Pre-deploy command** (required for schema changes to ship with code):  
   `npx prisma migrate deploy`  
   Applies migrations on each deploy, after the build and before the new version goes live; if it fails, Render cancels the deploy and the previous version keeps serving. Requires **`DATABASE_URL`** *and* **`DIRECT_URL`** to be set first (Prisma migrations use the session-mode pooler via `directUrl`).  
   ⚠️ **Pre-deploy commands only run on PAID instance types.** On the free plan this setting silently does nothing — migrations must then be applied by hand (this bit us in July 2026: code shipped for weeks against a table its migration had never created).  
   *If you use the repo’s [`render.yaml`](../render.yaml) Blueprint, this is already declared.*
7. **Instance type:** Free is fine for solo testing (expect **spin-down** after idle and a slow first request when it wakes) — but see the pre-deploy caveat above before relying on free for anything with a database schema.

Set **Node 20** if the dashboard allows it, or add env **`NODE_VERSION`** = `20` (see [Render Node](https://render.com/docs/node-version)). The backend declares **`engines.node`** in `package.json` for clarity.

---

## 2. Environment variables

Add these in the service **Environment** tab (values from Supabase / Groq / your notes). Do not commit real values.

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | Supabase Postgres URI (pooler notes in `database-production.md`) |
| `DIRECT_URL` | Yes if pre-deploy migrations are enabled | Session-mode pooler URI (port 5432, no `pgbouncer=true`); `prisma migrate deploy` fails without it |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_JWT_SECRET` | Yes | JWT verification (legacy secret or as per auth setup) |
| `CORS_ORIGINS` | Yes in prod | Comma-separated HTTPS origins for **browser** clients (Expo Web, etc.). **Native apps** often send no `Origin` and still work. |
| `GROQ_API_KEY` | Optional | If unset, generation can fall back to rule-based logic |
| `PORT` | No | Render injects this automatically |

Copy optional tunables from [`backend/.env.example`](../backend/.env.example) (`AI_RATE_*`, `CATALOG_RATE_*`, `JSON_BODY_LIMIT`) as needed.

**Frontend:** set **`EXPO_PUBLIC_API_BASE`** to your Render URL **without** a trailing slash and **without** `/api` (e.g. `https://jim-app-api.onrender.com`).

---

## 3. Health checks

In the service settings, set **Health check path** to:

`/api/health`

Use **`GET /api/health/ready`** manually or from your own monitors to confirm the database is reachable.

---

## 4. First deploy checklist

- [ ] All required env vars set (especially `CORS_ORIGINS` and `DATABASE_URL`)
- [ ] First deploy finishes; logs show the server listening
- [ ] `GET https://<your-service>.onrender.com/api/health` → 200
- [ ] `GET .../api/health/ready` → 200 once DB is correct
- [ ] App build with prod **`EXPO_PUBLIC_API_BASE`** can sign in and call the API

---

## 5. Blueprint (optional)

If you use **Infrastructure as Code**, commit [`render.yaml`](../render.yaml) at the repo root and connect the repo as a **Blueprint**. Set secret-like variables in the dashboard (`sync: false` placeholders). Adjust **name**, **region**, and **plan** to taste.
