# Week 2 — Compliance & ops (progress)

Sprint checklist also appears under **§7 • Week 2 — status** in `docs/MVP_REALITY_CHECK.md` (high-level done vs todo table). Details below.

This tracks the **“Week 2 — Compliance & ops”** slice from `docs/MVP_REALITY_CHECK.md`. Items are implemented incrementally to reduce risk.

## Done in-repo

- **Data export:** `GET /api/users/me/export` — JSON bundle of Prisma-backed user data (authenticated).
- **Account deletion:** `DELETE /api/users/me` — deletes app database rows for the user, then removes the Supabase Auth user when `SUPABASE_SERVICE_ROLE_KEY` is set on the server (see `backend/.env.example`).
- **Profile UI:** “Export my data” and in-app “Delete account” (replaces mailto-only flow).
- **Legal placeholders:** `docs/legal/privacy-policy.md`, `docs/legal/terms-of-service.md` — **must be replaced** with counsel-reviewed text and hosted URLs; wire URLs via `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` (see `frontend/.env.example`).
- **Backup drill runbook:** `docs/backup-restore-drill.md`.
- **LLM cost roadmap:** `docs/ops/llm-cost-tracking.md`.
- **Secret scanning (CI):** `.github/workflows/gitleaks.yml`.
- **Pre-commit hooks:** root `npm install` (repo `package.json`) enables **Husky** + **lint-staged** — runs matching package `npm run lint` when `backend/**/*.ts` or `frontend/**/*.{ts,tsx}` are staged.
- **LLM usage (Phase 1 logging):** `WorkoutGeneratorService` already emits JSON lines `event: "groq_completion"` with token totals (`logGroqCompletionMeta`). Point your log vendor or Metabase at that; **a dashboard UI / DB rollup** stays optional follow-up (`docs/ops/llm-cost-tracking.md`).

## Still manual / follow-up

- **Host** privacy & terms at stable HTTPS URLs (GitHub Pages, marketing site, or hosted policy generator).
- **Backup drill:** execute the checklist in staging and record dates/outcomes (template: `docs/backup-restore-drill.md`).
- **LLM cost dashboard:** aggregate `groq_completion` externally or implement Phase 2 persistence if you want in-app quotas.

## Environment reminders

| Variable | Where | Purpose |
|----------|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Backend only | Deletes Auth user on account deletion |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | Frontend | Store / in-app policy link |
| `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` | Frontend | Store / in-app terms link |

Never put the service role key in Expo `EXPO_PUBLIC_*` vars.
