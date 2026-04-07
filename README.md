# Jim App - Gym Workout Planner

Mobile app for planning and generating workouts: **Expo (React Native)** frontend, **NestJS** API, **PostgreSQL** via **Prisma**, **Supabase Auth**, and **Groq** for LLM-backed workout generation.

## Features

- Weekly workout planning and session logging
- **Groq**-powered generation (with rule-based fallback)
- Exercise catalog, saved exercises, and workout history
- REST API under global prefix **`/api`**

## Tech Stack

### Frontend (`frontend/`)

- **Expo SDK 54** · **React Native 0.81** · **React 19**
- **TypeScript** · **React Navigation** · **Axios**
- **Supabase JS** (auth; anon key only in the client)

### Backend (`backend/`)

- **NestJS 10** · **TypeScript**
- **Prisma** + **PostgreSQL** (e.g. Supabase)
- **Supabase JWT** validation (`SUPABASE_JWT_SECRET`)
- **Groq** (`groq-sdk`, `GROQ_API_KEY`)
- Rate limiting (`@nestjs/throttler`), Helmet, structured production logging — see `docs/` for ops

## Project Structure

```
Jim-App-main/
├── frontend/           # Expo app
├── backend/            # NestJS API (global prefix /api)
│   ├── prisma/
│   ├── data/           # Exercise JSON + video map (catalog)
│   └── src/
├── docs/               # Production checklist, CORS, DB, rate limits, etc.
└── README.md
```

## Prerequisites

- **Node.js** 18+
- **npm** (lockfiles committed; CI uses `npm ci`)
- **PostgreSQL** (local or Supabase)
- **Supabase** project (auth + DB URL)
- **Groq** API key ([console.groq.com](https://console.groq.com/))

## Getting Started

### Backend

```bash
cd backend
npm install
cp .env.example .env   # Windows: copy .env.example .env
```

Fill **`.env`** — authoritative list and comments are in **`backend/.env.example`**. Minimum for local dev:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_JWT_SECRET` | JWT secret (Settings → API) — not the anon key |
| `GROQ_API_KEY` | Groq API key for generation |

Optional: `PORT` (default `3000`), `CORS_ORIGINS`, `AI_RATE_*`, `CATALOG_RATE_*`, `JSON_BODY_LIMIT` — see `.env.example`.

```bash
npx prisma generate
npm run migrate:dev    # or: npx prisma migrate dev
npm run start:dev
```

API base: **`http://localhost:3000/api`** (health: `GET /api/health`).

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # copy .env.example .env on Windows
```

Set at least **`EXPO_PUBLIC_SUPABASE_URL`** and **`EXPO_PUBLIC_SUPABASE_ANON_KEY`**. For a physical device or non-default API host, set **`EXPO_PUBLIC_API_BASE`** to the backend origin **without** `/api` (e.g. `http://192.168.1.5:3000`). See **`frontend/.env.example`**.

```bash
npm start
```

The app resolves **`API_BASE_URL`** as `EXPO_PUBLIC_API_BASE` + `/api` (see `frontend/src/config/api.ts`).

## Production runbook

1. **Build** the backend: `cd backend && npm ci && npm run build`.
2. **Migrations**: apply with **`npm run migrate:deploy`** (uses `prisma migrate deploy`) against production `DATABASE_URL`. See **`docs/database-production.md`** and `.github/workflows/backend-migrate-deploy.yml` if you use GitHub Actions manually.
3. **Environment**: set **`NODE_ENV=production`**, **`DATABASE_URL`**, **`SUPABASE_URL`**, **`SUPABASE_JWT_SECRET`**, **`GROQ_API_KEY`**, and **required** **`CORS_ORIGINS`** (comma-separated browser origins). Copy any other keys from **`backend/.env.example`** as needed.
4. **Run**: `npm run start:prod` (or your process manager running `node dist/src/main`).
5. **Smoke checks**: `GET /api/health` (liveness), `GET /api/health/ready` (DB). See **`docs/backend-operations.md`**, **`docs/security-hardening.md`**, **`docs/cors-production.md`**, **`docs/ai-rate-limits.md`**.

Frontend: point **`EXPO_PUBLIC_API_BASE`** at your deployed API origin; ship with EAS per **`docs/mobile-release.md`**.

**Staging** (recommended before prod): separate DB/API/Supabase as described in **`docs/staging-environment.md`**; EAS **`staging`** profile / channel in **`frontend/eas.json`**.

## API (overview)

Authenticated routes expect `Authorization: Bearer <Supabase access token>`.

| Area | Examples |
|------|----------|
| Workouts | `GET/POST /api/workouts`, `POST /api/workouts/generate`, `POST /api/workouts/preview`, … |
| Plans | `POST /api/plans/generate-sessions`, … |
| Exercises | `GET /api/exercises`, `POST /api/exercises/search`, saved routes require auth |
| Logs | `GET/POST /api/workout-logs`, … |

Full behavior and rate limits: **`docs/ai-rate-limits.md`**, **`docs/exercises-public-api.md`**.

## LLM / Groq

Workout and plan generation call **Groq** from the backend only. Do **not** put `GROQ_API_KEY` in the Expo app. If Groq fails, the service can fall back to rule-based generation (`workout-generator.service.ts`).

## Scripts (reference)

| Location | Command | Purpose |
|----------|---------|---------|
| backend | `npm run start:dev` | Dev server |
| backend | `npm run migrate:deploy` | Production migrations |
| backend | `npm run lint` / `npm test` | Quality checks |
| frontend | `npm start` | Expo |
| frontend | `npm run eas:build:production` | EAS build (see `eas.json`) |

## Docs index

- **`docs/production-checklist.md`** — deploy readiness
- **`docs/database-production.md`**, **`docs/cors-production.md`**, **`docs/staging-environment.md`**, **`docs/mobile-release.md`**, **`docs/sentry-client.md`**, **`docs/e2e-staging.md`**

## Contributing

1. Fork the repository  
2. Create a branch (`git checkout -b feature/your-feature`)  
3. Commit and push  
4. Open a Pull Request  

## License

MIT License
