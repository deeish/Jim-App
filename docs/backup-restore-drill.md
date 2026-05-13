# Backup and restore drill (checklist)

Use this runbook before claiming production readiness. Execute at least once in staging; repeat after major schema or provider changes.

## Preconditions

- Access to the hosting provider (e.g. Render/Fly) and Supabase project.
- A **non-production** database URL for restore testing (never overwrite production during a drill without an explicit maintenance window).

## Supabase PostgreSQL

1. In Supabase → **Database → Backups**, confirm automated backups are enabled for the plan.
2. Note the **Point-in-Time Recovery (PITR)** retention window (if applicable).
3. Document the **connection string** used by production (`DATABASE_URL`) and where it lives (secret manager / env).

## Drill (staging)

1. Create a **staging** branch database (or reuse a disposable project).
2. Restore from a backup or PITR into that environment following [Supabase restore documentation](https://supabase.com/docs/guides/platform/backups) (exact steps depend on plan).
3. Run `npm run migrate:deploy` in `backend/` **only if** migrations must catch up — verify against team practice for restored dumps.
4. Smoke-test: `GET /api/health/ready`, sign-in, load a plan.
5. Record: date, who ran it, restore time, issues found.

## Off-site copy (optional but recommended)

Periodically export a logical backup (e.g. `pg_dump` of app schemas) to encrypted object storage with retention policy. Document bucket, encryption, and who can restore.

## Failure modes to rehearse

- Accidental deletion of a user row — verify backups and RPO expectations.
- Lost Supabase project — ensure `SUPABASE_*` and DB URLs are recoverable from a secrets vault.

_Last reviewed: Week 2 compliance track (implementation in repo)._
