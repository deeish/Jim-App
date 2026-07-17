# Production database workflow

## Apply migrations (not `db push`)

For **production** and **shared environments**, use Prisma Migrate:

```bash
cd backend
# Set DATABASE_URL to your Supabase (or other Postgres) connection string
npx prisma migrate deploy
```

npm scripts (same commands):

| Script | Purpose |
|--------|---------|
| `npm run migrate:deploy` | Apply pending migrations (use in deploy pipelines / prod shells). |
| `npm run migrate:dev` | Create & apply migrations locally during development. |
| `npm run migrate:status` | List migration history vs database. |

**Do not** rely on `prisma db push` for production—it does not keep migration history aligned across environments.

## Supabase `DATABASE_URL`

1. In Supabase: **Project Settings → Database**.
2. Use the **URI** connection string for the database your API will use.
3. For **IPv4-only** hosts, use **Session pooler** or **Transaction pooler** if Supabase recommends it for your network.

**Pooling:** For higher concurrency, prefer Supabase’s **PgBouncer pooler URL** (often port `6543` / “transaction mode”) for the Nest app, following [Supabase’s Prisma docs](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler). Use `?pgbouncer=true` and adjust parameters as Prisma recommends for your version.

**URI shape:** The login part must be exactly `postgres.<project-ref>:<password>` — **one** colon before the password. Do not paste the project ref twice (e.g. `postgres.ref:ref:password`); Prisma may then fail or the pooler may trip a **circuit breaker** after bad upstream auth.

**`FATAL: Circuit breaker open`:** Usually means the pooler stopped forwarding to Postgres after repeated failures. Typical causes: **wrong DB password** in `DATABASE_URL`, **project paused** (wake it in the Supabase dashboard), or a **cool-down** after many failed attempts (wait several minutes). Fix the URI/password, confirm the database is running, then retry. For Prisma + transaction pooler, append at least `?pgbouncer=true&sslmode=require` unless the dashboard gives a different recommended query string.

## Backups

In Supabase: **Project Settings → Database** — confirm **backups** and **retention** for your plan. Point-in-time recovery availability depends on plan tier.

## CI / deploy pipeline

- **Primary mechanism: Render's Pre-Deploy Command** (`npx prisma migrate deploy`, see `render-deploy.md` step 6). It couples schema to code: every deploy applies its own migrations, and a failed migration cancels the deploy while the old version keeps serving. Requires a paid instance type and both `DATABASE_URL` + `DIRECT_URL` in the service environment.
- Fallback / ad-hoc: GitHub Actions workflow **Backend: deploy migrations** (`workflow_dispatch`) in `.github/workflows/backend-migrate-deploy.yml` — set repo secret `DATABASE_URL` for the environment you intend to migrate. **Manual-only: do not rely on it as the primary path** (in July 2026 a release shipped without its migration ever being applied because this step was forgotten).

## Existing database created with `db push`

If tables **already exist** and match this schema but `_prisma_migrations` is empty:

1. Backup the database.
2. Confirm the committed migration matches reality (e.g. compare with `pg_dump --schema-only` or review SQL).
3. Mark the initial migration as already applied:

```bash
cd backend
npx prisma migrate resolve --applied 20260406120000_init
```

Then future migrations use `migrate deploy` normally.

**If `migrate deploy` fails** because objects already exist, do **not** run destructive SQL blindly—baseline with `migrate resolve` or engage [Prisma baselining](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining) for your situation.

## Fresh / empty database (staging, local, disaster recovery)

**`migrate:deploy` does NOT work on an empty database.** The migration history was
baselined against a live database: `20260101000000_baseline` is a no-op, and the
February `ALTER TABLE` migrations sort **before** `20260406120000_init` (the one that
actually creates the tables), so a fresh deploy fails with
`relation "workouts" does not exist`.

Bootstrap an empty database instead with:

```bash
cd backend
# DATABASE_URL -> the EMPTY target database
npm run db:bootstrap
```

This pushes the current schema (`prisma db push`) and then marks every committed
migration as applied, so `migrate deploy` works normally from that point on. The
script refuses non-localhost hosts unless `DB_BOOTSTRAP_ALLOW_REMOTE=1` is set, so a
stale `.env` pointing at production cannot be bootstrapped by accident.
