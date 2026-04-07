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

## Backups

In Supabase: **Project Settings → Database** — confirm **backups** and **retention** for your plan. Point-in-time recovery availability depends on plan tier.

## CI / deploy pipeline

- Run **`npm run migrate:deploy`** after the app is built and **before or during** the first rollout that needs the new schema, with `DATABASE_URL` set to the **target** database.
- Optional: GitHub Actions workflow **Backend: deploy migrations** (`workflow_dispatch`) in `.github/workflows/backend-migrate-deploy.yml` — set repo secret `DATABASE_URL` for the environment you intend to migrate.

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

## Fresh production database

For an **empty** database, `npm run migrate:deploy` applies `20260406120000_init` and creates all tables.
