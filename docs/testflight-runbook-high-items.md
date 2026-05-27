# TestFlight runbook — remaining HIGH items (you-only dashboard work)

**Last reviewed:** 2026-05-27
**Status:** Backend Steps 1/2/3 of the re-attempt strategy are merged (PRs #1, #2, #3). Backend Sentry wiring is live (no-op until `SENTRY_DSN` is set). This runbook covers the section 2 HIGH items from `testflight-launch-checklist.md` that only you can do — Supabase / Render / Sentry dashboards.

Work top to bottom; each item is independent so you can stop and resume. Easiest first.

---

## 1. Render: confirm `GENERATION_CAPTURE` is off (checklist 2.8)

Fastest check on the list. The capture feature writes user payloads to disk on the shared Render box.

1. Render → your service → **Environment**.
2. Search for `GENERATION_CAPTURE`.
   - **Not present** → ✅ done.
   - **Present and `0` / empty** → ✅ done.
   - **Present and `1` / `true`** → set to `0` or remove the var. Save.

**Verify:** if you had to change it, watch Deploys tab — auto-redeploy. Confirm boot still reaches `Listening on :PORT`.

---

## 2. Render: loosen AI rate limits for the beta (checklist 2.7)

Default `AI_RATE_BURST_MAX=12/min` and `AI_RATE_DAY_MAX=120/day` will burn out fast for friends generating and re-generating plans.

1. Render → your service → **Environment** → **Add Environment Variable** (twice):
   - `AI_RATE_BURST_MAX` = `30`
   - `AI_RATE_DAY_MAX` = `300`
2. Save → auto-redeploy.

**Verify:** after deploy, no behavior to inspect from outside — these just raise the ceiling before a tester sees `429`. Re-tune downward after a week of real usage.

---

## 3. Supabase: pick an email-verification posture (checklist 2.4)

One toggle, but a decision.

| Choice | Pros | Cons |
|---|---|---|
| **Require email confirmation** | Standard. Stops bots. | TestFlight friends may not verify → you debug "I can't sign in." |
| **Don't require** | Lower friction; testers in immediately. | Bots can create real accounts (low risk for an unannounced TestFlight). |

**Recommendation for the friends-and-family TestFlight:** don't require. Re-enable when going external.

1. Supabase Dashboard → your project → **Authentication → Sign In / Up** (sometimes labeled "Providers" or "Email").
2. Find **"Confirm email"** toggle → set per your choice above.
3. Save.

**Verify:** create a test signup with a fresh email. If "Confirm email" is **off**, you should be signed in immediately. If **on**, you'll see a "check your email" state.

---

## 4. Supabase: password-reset deep link (checklist 2.3)

The app's URL scheme is `jimapp://`. Without server-side allowlisting, Supabase's recovery email link won't open the standalone app.

1. Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**.
2. **Add URL:** `jimapp://**`
3. (Optional, for Expo Go testing) **Add URL:** `exp://**`
4. Save.

**Verify (after the first TestFlight build):**
- Sign in with a real account.
- Profile → request password reset.
- Tap the link in the email on the device.
- App should open at the SetNewPassword screen, not 404 in a browser.

---

## 5. Sentry: create projects + wire DSNs (checklist 2.5 + backend Step 3 activation)

The biggest item. **Create TWO Sentry projects** — one for the backend (`@sentry/node`, just deployed in PR #3) and one for the React Native app. Keeping them separate keeps dashboards clean.

### 5a. Create the projects

1. sentry.io → **Projects → Create Project**.
2. Platform: **Node.js** → name e.g. `jim-api`. Create.
3. Repeat: **React Native** → name e.g. `jim-app`. Create.
4. For each, copy the DSN from **Project Settings → Client Keys (DSN)**.

### 5b. Backend DSN on Render

1. Render → your service → **Environment** → Add:
   - `SENTRY_DSN` = the `jim-api` DSN you just copied.
   - `SENTRY_ENVIRONMENT` = `production`
2. Save → auto-redeploy.
3. After deploy, watch for any boot errors in Logs tab (Sentry init runs on first import).

**Verify:** force a 500. Temporarily add a `/api/health/boom` route that throws, deploy, hit it, then revert. Or hit any endpoint that already throws — but easier with the boom route. Confirm the event lands in the `jim-api` Sentry project with the `request_id` tag populated (you can take that tag value and quote it in support replies).

### 5c. Frontend DSN in `eas.json`

The `frontend/src/lib/sentry.ts` already gates on `EXPO_PUBLIC_SENTRY_DSN` (lines 5–7). Wire it into all three EAS build profiles.

1. Open `frontend/eas.json` locally.
2. In each profile's `env` block (`preview`, `staging`, `production`), add:
   ```
   "EXPO_PUBLIC_SENTRY_DSN": "<the jim-app DSN you just copied>"
   ```
3. Commit + push.

### 5d. EAS secrets for source-map upload

These secrets are **build-time** (not runtime) so they live in EAS secrets, not in `eas.json`. They let Sentry deobfuscate stack traces.

From `frontend/`:

```powershell
cd frontend
npx eas-cli@latest secret:create --name SENTRY_AUTH_TOKEN --value <token from sentry.io → User Settings → Auth Tokens (scope: project:releases, project:write)>
npx eas-cli@latest secret:create --name SENTRY_ORG --value <your sentry org slug>
npx eas-cli@latest secret:create --name SENTRY_PROJECT --value jim-app
```

Confirm: `npx eas-cli@latest secret:list`.

**Verify (after first EAS build):**
- Trigger a crash on the device, or call `Sentry.captureMessage('test')` from a debug button.
- Event lands in the `jim-app` Sentry dashboard with **readable** stack frames (source maps applied).

---

## After all of these are done

Re-open `docs/testflight-launch-checklist.md` and tick:
- 2.3 ✅
- 2.4 ✅
- 2.5 ✅
- 2.7 ✅
- 2.8 ✅

What's left in section 2 (HIGH) at that point:
- **2.2 Sign-out routing bug** — needs a real iOS build to verify
- **2.10 Build-number auto-increment** — needs the first TestFlight upload
- **2.11 Pre-flight test on real iOS device** — needs the first preview build

All three require a build, which requires section 1 BLOCKERS to be finished (1.1 real assets, 1.4 `eas init`). Those are still your call.
