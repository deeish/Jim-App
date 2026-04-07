# E2E smoke tests (Expo Web → staging)

Smoke flows live in **`frontend/e2e/smoke.spec.ts`** and run with **Playwright** against **Expo Web** (Chromium). They target **staging** (or local) using environment variables — not committed secrets.

## What is covered

1. **Sign in** with a staging test user (`E2E_STAGING_EMAIL` / `E2E_STAGING_PASSWORD`).
2. **Home** loads (`e2e-home-root`).
3. **Plan** tab opens plan shell (`e2e-plan-root`).
4. **Workout** tab opens workout shell (`e2e-workout-root`).
5. **Save workout** (soft): if the heart control is present and enabled, tap once (saved-workout toggle). Skipped when there is no workout / id.

Stable hooks are **`testID`s** in the app (see `e2e-*` ids in `LoginScreen`, `NavBar`, `HomeScreen`, `PlanScreen`, `WorkoutScreen`, `WorkoutLikeButton`).

## Build staging Web with production-like env

The bundle must talk to your **staging** Supabase and API:

```bash
cd frontend
# Example – use your staging URLs
export EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
export EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
export EXPO_PUBLIC_API_BASE=https://staging-api.example.com
```

For a **hosted** static preview, run `npx expo export --platform web` (per current Expo docs) and deploy `dist`; set `PLAYWRIGHT_BASE_URL` to that origin. For **local** runs, Playwright starts `expo start --web` unless you opt out (below).

## Run locally

```bash
cd frontend
npm ci
npx playwright install chromium
export E2E_STAGING_EMAIL=e2e-user@example.com
export E2E_STAGING_PASSWORD='your-staging-password'
npm run e2e
```

- Omit **`E2E_*`** to skip the spec (intended for CI without secrets).
- **`PLAYWRIGHT_SKIP_WEBSERVER=1`** — do not start Expo; use with **`PLAYWRIGHT_BASE_URL`** when the app is already running or deployed.
- **`PLAYWRIGHT_BASE_URL`** — default `http://127.0.0.1:8081` (Expo Web / Metro).

## CI: manual staging workflow

`.github/workflows/e2e-staging.yml` is **workflow_dispatch** only. Configure repository secrets:

| Secret | Purpose |
|--------|---------|
| `E2E_STAGING_EMAIL` | Staging test account email |
| `E2E_STAGING_PASSWORD` | Staging test account password |
| `PLAYWRIGHT_BASE_URL` | Deployed staging Web URL (HTTPS) |

Optional: add the same `EXPO_PUBLIC_*` values as **EAS / hosting** build env so the deployed Web matches what you test.

## Related

- Staging stack and promotion gate: `docs/staging-environment.md`
- Production checklist §11–12: `docs/production-checklist.md`
- Mobile release / EAS: `docs/mobile-release.md`
