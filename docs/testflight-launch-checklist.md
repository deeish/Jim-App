# TestFlight launch checklist

**Last reviewed:** 2026-06-02
**Owner:** Dylan
**Status:** Pre-launch — **all Apple-free work is complete** (Section-1 blockers cleared, dashboards configured, Expo project `@deeish1/jim-app` linked, code committed & green). Not yet shipped to TestFlight.

> ## ▶ NEXT STEP → Buy the Apple Developer Program membership ($99/yr)
>
> As of **2026-06-02**, every task that does **not** require Apple is done. The single remaining gate before the first TestFlight build is the **Apple Developer Program membership** — enroll at **developer.apple.com/programs**. Everything after it is Apple-gated:
> 1. `eas build --profile preview --platform ios` (EAS will prompt for your Apple login to create signing certs) + `eas device:create` to register your iPhone.
> 2. Install on device → run the **Section 4** device checklist (sign-out 2.2, cold-install onboarding 3.5, plan generation, password-reset deep link, account deletion 3.8).
> 3. `eas submit` → TestFlight.
>
> _(One pre-purchase task first: fix plan-generation workout quality — see [`PLAN_GENERATION_QUALITY_FIXES.md`](./PLAN_GENERATION_QUALITY_FIXES.md). 5 deterministic, free-Groq-safe fixes; verified working at 2 Groq calls / 3-week plan.)_

A strict, file-by-file punch list of everything to fix, add, or double-check before pushing this build to TestFlight. Items here are the ones that are **not** already covered by the existing ops docs. For background and "what's been built," see the References section at the bottom.

---

## How to use this checklist

This doc has **two tiers**:

1. **Internal TestFlight** (≤100 friends invited by email, no Apple review). All BLOCKER and HIGH items must be clean. MEDIUM should be planned. APP-STORE-ONLY items can wait.
2. **External TestFlight or App Store submission** (requires Beta App Review, hosted privacy policy, content rating, screenshots, etc.). All items in this doc apply.

Severity legend:

| Tag | Meaning |
|-----|---------|
| **BLOCKER** | Build will fail, ship broken, or expose credentials. Do not upload until fixed. |
| **HIGH** | Will embarrass you in front of testers, lose data, or blow the Groq budget. Fix before inviting anyone. |
| **MEDIUM** | Should be done within the first TestFlight cycle but not gating. |
| **APP-STORE-ONLY** | Defer until moving past internal TestFlight; required for Beta App Review or public release. |

Work top-to-bottom. Tick items as you go.

---

## 1. BLOCKERS — must fix before any TestFlight build

**Section 1 progress (updated 2026-05-26 after Supabase restore):**

| Item | Status | Notes |
|------|--------|-------|
| 1.1 Replace placeholder app assets | ✅ Done (temporary art) | On-brand gold→orange "J" chip generated 2026-06-02 (icon/splash/adaptive/favicon; real KB sizes; icon is opaque RGB, no alpha). Swap for final art before public App Store. |
| 1.2 Settle bundle identifier | ☑ Deferred to App Store push | Keep `com.jimapp.app` for internal TestFlight |
| 1.3 Wire EAS build profiles to env vars | ✅ Done | `env` blocks added to all three profiles; values verified still valid after Supabase restore |
| 1.4 Link Expo project (`eas init`) | ✅ Done (2026-06-02) | Linked `@deeish1/jim-app` (projectId `1b20c133-…fab3b0`) in `app.json` + `owner`. Also fixed an invalid top-level `update` block in `eas.json` that was failing schema validation (would have blocked all `eas` commands). |
| 1.5 Restore production infrastructure | ✅ Done | Supabase unpaused; Render `/api/health` and `/ready` both 200; anon key still valid |
| 1.6 Set `CORS_ORIGINS` on Render | ✅ Implicitly done | Render booted to 200 — only possible if CORS_ORIGINS is set (otherwise boot throws) |

**Section 1 BLOCKERS remaining for first build:** **none — all cleared (2026-06-02).** 1.1 has temporary on-brand art (swap before public launch); 1.4 linked the Expo project `@deeish1/jim-app`. The first iOS build now only needs the **Apple Developer account** ($99/yr).

---

### 1.1 Replace placeholder app assets — **BLOCKER** — ✅ DONE with temporary art (2026-06-02)

The four 70-byte placeholders were replaced with on-brand temporary art generated from the `JimLogo` mark (gold→orange diagonal gradient chip, cream heavy-italic "J", glossy top highlight). These are real, valid PNGs that pass Apple's icon validation — good enough to ship the first internal TestFlight. **Swap for finished art before public App Store submission.**

- [x] **`frontend/assets/icon.png`** — 1024×1024, **opaque RGB (no alpha)** ✅, full-bleed gradient + "J". (~56 KB)
- [x] **`frontend/assets/splash.png`** — 1284×2778, dark `#0F1110` bg with the centered chip; matches `splash.backgroundColor` in `app.json`. (~41 KB)
- [x] **`frontend/assets/adaptive-icon.png`** — 1024×1024 transparent foreground, chip centered inside the safe zone (Android masks the outer ring; bg `#0F1110` from `app.json`). (~41 KB)
- [x] **`frontend/assets/favicon.png`** — 48×48 opaque. (~2 KB)

To regenerate or replace later: drop final 1024×1024 (opaque, no alpha) art at `icon.png` and a launch image at `splash.png`; EAS derives the rest. There is no penalty for iterating on art during internal beta.

**Verify (already passing):**
```powershell
Get-ChildItem 'frontend\assets' -Filter '*.png' | Select-Object Name, Length
# Each file should now be at least a few KB, not 70 bytes.
```

**Quick path if you don't have art yet:** use a free icon generator (e.g. `appicon.co` or Figma) and ship a temporary monogram-style icon for the first TestFlight build. You can swap it later via EAS Update or a new build — there's no penalty for iterating on art during internal beta.

### 1.2 Settle the bundle identifier — **DEFERRED to App Store push** (acceptable for internal TestFlight)

**Status (2026-05-26):** Decided to keep `com.jimapp.app` for internal TestFlight (`frontend/app.json:20` and `:27`). Revisit before external/public App Store submission.

- [ ] Before external TestFlight or App Store submission: confirm `com.jimapp.app` is registered to your Apple Developer account in **App Store Connect → Identifiers**.
- [ ] If you later choose a different ID (e.g. `com.dylansalmo.jim`), update both `frontend/app.json:20` (`ios.bundleIdentifier`) and `frontend/app.json:27` (`android.package`) and keep them identical.
- [ ] Note: changing the bundle ID after the first App Store submission requires creating a new app record. Lock it in before that point.

### 1.3 Wire EAS build profiles to actual environment variables — **BLOCKER** ✅ STRUCTURE DONE, VALUES NEED REFRESH

**Done 2026-05-26:** `frontend/eas.json` now has `env` blocks in all three profiles (`preview`, `staging`, `production`) with `EXPO_PUBLIC_API_BASE`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_APP_ENV`. Each profile sets `EXPO_PUBLIC_APP_ENV` to its name.

**Remaining work (blocked on 1.5):**

- [ ] After Supabase project is recreated/restored (1.5), replace the now-dead `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` values in all three profiles in `frontend/eas.json` with the new ones.
- [ ] After the Render backend is restored (1.5), confirm `EXPO_PUBLIC_API_BASE` still matches the live URL.
- [ ] When Sentry project exists, add `EXPO_PUBLIC_SENTRY_DSN` to each profile's env block. Also create EAS secrets (not put in `eas.json`): `eas secret:create --name SENTRY_AUTH_TOKEN --value <token>`, `--name SENTRY_ORG`, `--name SENTRY_PROJECT`. These are read at build time by `frontend/app.config.js` lines 12–13 to configure the Sentry plugin for source-map upload.

**Why inline values in `eas.json` is acceptable:** `EXPO_PUBLIC_*` keys are embedded in the compiled bundle and visible to anyone who extracts the binary. Storing them in the repo is no more exposed than shipping the app. Build-time secrets like `SENTRY_AUTH_TOKEN` are *not* embedded in the bundle and must stay out of `eas.json` — use EAS secrets for those.

**Background — what was broken before:** `eas.json` had no `env` blocks at all. `frontend/src/config/api.ts:22` falls back to `http://localhost:3000` if `EXPO_PUBLIC_API_BASE` is unset; lines 24–28 then throw at launch in any non-`__DEV__` build because the URL is `http://`. A production binary built with the old `eas.json` would crash on first open.

### 1.4 Link the Expo project — **BLOCKER** — ✅ DONE (2026-06-02)

Project linked: **`@deeish1/jim-app`**, projectId **`1b20c133-46eb-43d0-b4ca-d8f083fab3b0`**, owner `deeish1`. Created via `eas init` (authenticated with a one-time `EXPO_TOKEN`, since the account is GitHub/SSO).

- [x] Expo account created (GitHub SSO).
- [x] `eas init` run — project created at https://expo.dev/accounts/deeish1/projects/jim-app
- [x] `app.json` now has `expo.extra.eas.projectId` **and** `owner: "deeish1"`, both committed (`769c1d0`).
- [x] **Fixed a blocking `eas.json` bug along the way** (`1c0c2fd`): a top-level `update` block isn't part of the eas.json schema and failed validation on eas-cli v20 — it would have blocked `eas build` too. Update channels are still set per build profile via `channel`.

**Note on the dynamic config:** because `app.config.js` exists, `eas init` couldn't auto-persist the projectId via the JS file and threw a cosmetic `Cannot read properties of undefined (reading 'eas')` at the end — but it had already written `extra.eas.projectId` into `app.json`, which `app.config.js` spreads through. Verified linked via `eas project:info`.

### 1.5 Restore production infrastructure — ✅ DONE (2026-05-26)

**Re-probed after manual restore:**

- `nslookup jmfshcpgtuqdjmtpexqg.supabase.co` → resolves to Cloudflare IPs (104.18.38.10, 172.64.149.246).
- `curl https://jmfshcpgtuqdjmtpexqg.supabase.co/auth/v1/health -H "apikey: <anon>"` → **200**.
- `curl https://jim-app-l8o7.onrender.com/api/health` → **200** (cold-start was ~31s, then warm).
- `curl https://jim-app-l8o7.onrender.com/api/health/ready` → **200** (DB reachable through backend — confirms Supabase + DB + JWT all wired).

Existing values in `frontend/eas.json` remain valid since the URL didn't change.

**Original failure record (2026-05-26 earlier in day):**

- Supabase URL had returned `NXDOMAIN` — project was paused, not deleted; manual restore brought it back.
- Render backend was timing out at 120s; once Supabase came back and the service was redeployed, it boots cleanly.

Actions:

- [ ] **Recreate or restore Supabase project.**
  - Sign in at supabase.com and check whether the original project can be unpaused (Project Settings → General).
  - If gone entirely: create a new project. Copy the new Project URL and `anon` key.
  - Run all migrations against the new DB: `cd backend && npm run migrate:deploy` with the new `DATABASE_URL` (or via `.github/workflows/backend-migrate-deploy.yml`).
  - In **Auth → URL Configuration**, add `jimapp://**` to Redirect URLs (covers 2.3 as well).
  - Update `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `DATABASE_URL` (and `DIRECT_URL` if used) in the **backend Render env**.
  - Update `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in **`frontend/eas.json`** (currently inlined per profile with the dead values).
  - Update your local `frontend/.env` and `backend/.env` for dev parity.

- [ ] **Restore Render backend service.**
  - Log in to Render → check the `jim-app-l8o7` (or replacement) service status.
  - If suspended/crashed: read the logs to find the boot error. Most likely missing `CORS_ORIGINS` (see 1.6) or missing/invalid Supabase keys after Supabase recreation.
  - Re-deploy with all env vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `GROQ_API_KEY`, `CORS_ORIGINS`, `NODE_ENV=production`.
  - If the service was deleted: re-create per `docs/render-deploy.md`. Note the new URL; update `EXPO_PUBLIC_API_BASE` in `frontend/eas.json` (currently `https://jim-app-l8o7.onrender.com` across all three profiles).

- [ ] **Re-verify after restoration:**
  - `curl https://<new-url>/api/health` → 200
  - `curl https://<new-url>/api/health/ready` → 200 (DB reachable)
  - All 7 migrations in `backend/prisma/migrations/` are applied (latest: `20260507120000_add_workout_unique_and_plan_isactive`).

- [ ] **Decide whether to upgrade off Render free tier.** Free tier spins down after 15 min of inactivity → first request from a tester after lunch is a 30–60s cold start. Friends won't wait. $7/mo Starter keeps it warm.

### 1.6 Set `CORS_ORIGINS` on Render — **BLOCKER** (likely cause of the Render service being down today)

`backend/src/cors-origins.ts:33-37` **throws at boot in production** if `CORS_ORIGINS` is empty. Native iOS apps don't send an `Origin` header so they bypass CORS regardless, but the server **will not start** without this env var set. This is the most likely cause of the Render service being unreachable in 1.5.

- [ ] In Render → your service → **Environment**, add:
  - `CORS_ORIGINS` = comma-separated allowlist. Minimum: the service's own origin (e.g. `https://jim-app-l8o7.onrender.com`). If you ship Expo Web at any point, add that origin too.
- [ ] **Also confirm these are all set on Render** (since the service is currently failing to boot, audit the full set):
  - `NODE_ENV=production`
  - `DATABASE_URL` (and `DIRECT_URL` if your migrations need it)
  - `SUPABASE_URL`
  - `SUPABASE_JWT_SECRET` (the JWT secret, **not** the anon key)
  - `GROQ_API_KEY`
  - `CORS_ORIGINS` (this item)
- [ ] After saving env vars, redeploy. Watch the deploy logs for "Listening on port..." or any boot-time `Error` lines.
- [ ] Verify: `curl https://jim-app-l8o7.onrender.com/api/health` → 200.

---

## 2. HIGH — fix before letting friends in

**Section 2 progress (2026-05-26):**

| Item | Status | Notes |
|------|--------|-------|
| 2.1 `.env` in `.gitignore` | ✅ Already done | Both files contain the entries; original audit only read `head -20` |
| 2.2 Sign-out routing bug | ✅ Fixed + committed (`b1c52e9`) | Root cause: iOS can't present an Alert over a dismissing Modal; fix presents confirm from `Modal onDismiss`. Only on-device verify remains. |
| 2.3 Supabase password-reset deep link | ⬜ Open (blocked on 1.5) | Supabase dashboard — bundled with the Supabase recreation in 1.5 |
| 2.4 Supabase email-verification posture | ⬜ Open (blocked on 1.5) | Supabase dashboard decision |
| 2.5 Sentry DSN | ✅ Done (mobile DSN set) | `EXPO_PUBLIC_SENTRY_DSN` set in all 3 `eas.json` profiles + committed. Source-map upload secrets pending `eas init` (Task 8). |
| 2.6 Groq call timeout | ✅ Done in code | 15s AbortController at all three call sites; lint + 134 tests green |
| 2.7 Loosen AI rate limits | ⬜ Open (blocked on 1.5) | Render env vars |
| 2.8 Disable `GENERATION_CAPTURE` | ⬜ Open (blocked on 1.5) | Confirm Render env |
| 2.9 Console-log audit | ✅ False alarm | Already correctly guarded / intentionally fed to Sentry |
| 2.10 Verify build-number auto-increment | ⬜ Verify after first build | Requires first TestFlight upload to test |
| 2.11 Pre-flight test on real iOS device | ⬜ Verify after first build | Requires `eas build --profile preview --platform ios` |

**What's left for you:** nothing in the dashboards — **2.3, 2.4, 2.5, 2.7, 2.8 are all done (2026-06-02)**. Only the device-verify items remain (2.2, 2.10, 2.11), which require the first iOS build (Apple Developer account).

---

### 2.1 `.env` in `.gitignore` — ✅ ALREADY DONE

Verified 2026-05-26 by reading both files in full:

- `frontend/.gitignore:21-24` — already ignores `.env`, `.env.local`, `.env.*.local`.
- `backend/.gitignore:37-40` — same.

The initial audit reported this as missing because it only inspected the first 20 lines of each file. False alarm; nothing to change.

### 2.2 Verify the sign-out routing bug — **HIGH** — ✅ FIXED + COMMITTED (`b1c52e9`), device-verify only

**Root cause found & fixed (2026-06-01, committed `b1c52e9`):** the HomeScreen profile-menu sign-out did nothing on iOS because `showConfirmDialog` is the OS-level `Alert.alert`, and iOS silently drops an Alert presented while another modal (the menu `<Modal>`) is still dismissing. The old `setTimeout(350ms)` band-aid was too short on some devices. Fix: on iOS, set a `pendingSignOutConfirm` flag + `closeMenu()`, then present the confirm from the menu `<Modal onDismiss={…}>` (fires after full dismissal); Android/web present immediately. `AuthContext.signOut` and the `App.tsx` AuthStack swap were always correct.

- [ ] **Device verify only:** on a real iOS TestFlight build, sign in → open Home → sign out from the profile menu. Confirm dialog must appear, then the app navigates cleanly back to Login with no white flash, no stuck modal, no auth-restored-on-refresh. (The fix is logically sound and passes tsc/tests, but the original bug was device-specific, so confirm on hardware.)
- Files: `frontend/src/screens/HomeScreen.tsx`, `frontend/src/lib/confirmAlert.ts`, `frontend/src/contexts/AuthContext.tsx`.

### 2.3 Configure password-reset deep link in Supabase — **HIGH**

`frontend/app.json:5` registers scheme `jimapp`. `frontend/src/lib/authDeepLink.ts` and `frontend/src/contexts/AuthContext.tsx` (around line 129) build a recovery URL via `Linking.createURL('auth/reset')`. Without server-side allowlisting, Supabase's recovery email will succeed but the email link will not open the standalone app.

- [ ] In Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**, add `jimapp://**`.
- [ ] If you want to test in Expo Go too, also add the `exp://...` URL that `Linking.createURL` logs in dev.
- [ ] Run the full reset flow on a TestFlight build: request reset → tap email link → confirm it opens the app at the SetNewPassword screen → set new password → sign in.

Reference: `docs/mobile-release.md` lines 96–103.

### 2.4 Pick a Supabase email-verification posture — **HIGH**

- [ ] Decide: require email confirmation on sign-up or not.
  - Required = standard, but TestFlight friends may not bother to verify, and you'll spend time debugging "I can't sign in" reports.
  - Not required = lower friction, but bots can create real accounts (low risk for an unannounced TestFlight).
- [ ] Set in Supabase Dashboard → Auth → Settings → "Confirm email."

### 2.5 Configure Sentry DSN and verify ingest — **HIGH** — ✅ DSN DONE (2026-06-02)

Sentry is wired: `frontend/src/lib/sentry.ts` gates init on `EXPO_PUBLIC_SENTRY_DSN`, and `@sentry/react-native` is in `frontend/app.json:34` plugins (`@sentry/react-native/expo` configured in `app.config.js`).

- [x] Create or pick a Sentry project. **(mobile project exists in the user's Sentry org)**
- [x] Set `EXPO_PUBLIC_SENTRY_DSN` — **set in all 3 `eas.json` profiles and committed.** (Inline in `eas.json` is fine per 1.3; `EXPO_PUBLIC_*` is embedded in the bundle anyway.)
- [ ] Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` as **EAS secrets** so source maps upload on build (needs the EAS project → do during Task 8 / 1.4).
- [ ] After the first build, force a crash or call `Sentry.captureMessage('test')` from a debug button, and confirm it appears in the Sentry dashboard. *(needs a build → Apple account)*

Reference: `docs/sentry-client.md`.

### 2.6 Add a Groq call timeout — ✅ DONE (2026-05-26)

All three Groq call sites in `backend/src/workouts/workout-generator.service.ts` now have a 15s `AbortController` timeout:

- Line ~1116 (`generateFullProgram`) — already had a `try/catch` that returns `null` on failure; added `signal` + `finally { clearTimeout }`.
- Line ~1488 (`polishSimpleBatchSessionCopy`) — already had a `try/catch` that returns `null` on failure; added `signal` + `finally { clearTimeout }`.
- Line ~1763 (`generateWithGroq`) — previously had **no `try/catch` at all**; added try/finally so the timer is cleared. The aborted call still throws to the caller, which already has a rule-based fallback.

Module-level constant `GROQ_REQUEST_TIMEOUT_MS = 15_000` defined near the top of the file. Backend lint, `tsc --noEmit`, and 134 unit tests all pass.

Follow-up to consider after launch:
- [ ] Optionally surface degraded state in the client (return a flag in the response body so the UI knows a workout came from the rule-based fallback, not the LLM).

### 2.7 Loosen AI rate limits for early adopters — **HIGH**

Defaults in `backend/src/app.module.ts` (lines 46–54): `AI_RATE_BURST_MAX=12` per 60s, `AI_RATE_DAY_MAX=120` per day per user. A friend who generates and re-generates a plan a few times will hit the daily ceiling in minutes.

- [ ] On Render env, set `AI_RATE_BURST_MAX=30` and `AI_RATE_DAY_MAX=300` for the beta window.
- [ ] After the first week, tune down toward the defaults based on real usage.
- [ ] Confirm 429 responses still return a sensible error in the app UI.

Reference: `docs/ai-rate-limits.md`.

### 2.8 Disable `GENERATION_CAPTURE` in production — **HIGH**

The capture feature (`backend/src/plans/generation-capture.ts`) writes user-input payloads to disk. Fine for local QA; **not** fine on a shared Render box.

- [ ] On Render env, confirm `GENERATION_CAPTURE` is unset or `0`.
- [ ] Confirm `backend/logs/generation-captures/` is empty or non-existent on the production filesystem.

### 2.9 Console-log audit — ✅ ALREADY CLEAN (false alarm)

Re-verified by reading each flagged file in full on 2026-05-26. The initial audit reported line numbers without inspecting the **enclosing block**, which led to false positives:

- `frontend/src/api/client.ts:60, 78, 80, 82, 84` — all reported as unguarded, but lines 60 is inside `if (__DEV__ && config.url?.includes('plans')) { ... }` at line 57, and lines 78–84 are inside `if (__DEV__ && error.config) { ... }` at line 71. All correctly dev-guarded already.
- `frontend/src/components/WorkoutDetailModal.tsx:129`, `frontend/src/screens/WorkoutScreen.tsx:529/550/649` — these are `console.error` calls inside `catch` blocks that already display a user-facing `Alert.alert(...)`. In React Native production, unguarded `console.error` is the **intended pattern** because `@sentry/react-native` captures it as a breadcrumb. Wrapping in `__DEV__` would reduce production telemetry.

The codebase pattern is already correct:
- Chatty diagnostic logs (e.g. `[SearchScreen] focus: refreshed savedExerciseIds`) — guarded with `if (__DEV__)`.
- Error reports in `catch` blocks — unguarded `console.error` for Sentry breadcrumb capture.

No code changes needed.

### 2.10 Verify build-number auto-increment works on second upload — **HIGH**

`frontend/eas.json:16` has `autoIncrement: true` for production. This relies on `appVersionSource: "remote"` (line 4) which is set correctly.

- [ ] After your first successful TestFlight upload, run a second `eas build --profile production --platform ios` and confirm the build number bumps. If it doesn't, Apple will reject the second upload with a duplicate-build error.

### 2.11 Pre-flight test passes on a real iOS device — **HIGH**

Before uploading to TestFlight at all:

- [ ] Run the full pre-flight checklist (Section 4 below) on a physical iPhone via `eas build --profile preview --platform ios` and `eas device:create` + install.

---

## 3. MEDIUM — fix soon, not gating

**Section 3 progress (updated 2026-05-27 after successful re-attempt):**

| Item | Status | Notes |
|------|--------|-------|
| 3.1 Backend Sentry | ✅ Done, deployed | PR #3 (`aaca334`). No-op until `SENTRY_DSN` is set on Render — see runbook §5b |
| 3.2 Request-ID correlation | ✅ Done, deployed | PR #1 (`4d9b33d`). Verified live: `X-Request-Id` header on every response |
| 3.3 `/ready` probes Supabase + Groq | ✅ Done, deployed | PR #2 (`306d361`). Verified live: `{"checks":{"db":"ok","supabase":"ok","groq":"ok"}}` |
| 3.4 iOS permission descriptions | ✅ No-op (verified clean) | No permission-gated packages installed |
| 3.5 Cold-install onboarding walkthrough | ⬜ Needs device | After first build |
| 3.6 In-app support contact | ✅ Fixed (2026-06-02) | `FEEDBACK_MAILTO` now addresses `myjimplanner@gmail.com` (override: `EXPO_PUBLIC_FEEDBACK_EMAIL`) |
| 3.7 Accessibility labels | ⬜ Post-launch acceptable | |
| 3.8 Account deletion + export verification | ⬜ Needs running app | |

**Re-attempt strategy that worked (2026-05-27):** the prior `2d11cb5` bundle was split into three sequential PRs (#1 → #2 → #3) and deployed one at a time, each verified before merging the next. The hypotheses about `@sentry/node` / `@opentelemetry` transitive deps proved unfounded — Render installed and booted everything cleanly. The actual root cause of the `2d11cb5` silent failure was almost certainly the same thing that bit us on PR #1's first deploy: **`GROQ_API_KEY` was missing from Render env vars**, causing Joi config validation in `app.module.ts` to throw at boot before the app could bind a port. Render kept the previous deploy live, masking the failure.

**Lesson for future "silent" Render deploy failures:** before suspecting code, check Render → Deploys tab for the actual deploy log, and verify every env var the code reads at boot is present. The audit list is in section 1.6 above.

---

### 3.1 Backend crash reporting — ✅ DONE, DEPLOYED (2026-05-27)

**Status:** shipped in PR #3 (commit `aaca334`). No-op until `SENTRY_DSN` is set on Render — that activation step is in `docs/testflight-runbook-high-items.md` §5b.

The three earlier-bundled commits (`2d11cb5` Sentry+request-id+ready) were reverted on 2026-05-26 after Render deploys failed silently. On 2026-05-27 the bundle was split into PRs #1/#2/#3 and shipped sequentially. The hypotheses below proved unfounded; the actual root cause of the 2026-05-26 failure was almost certainly that `GROQ_API_KEY` wasn't set on Render (the Joi config in `app.module.ts:35` requires it; missing it kills boot before the port opens).

**Implementation details (now live in production):**

`@sentry/node` v10 installed and wired. Backend captures unhandled exceptions and 5xx `HttpException`s with full stack traces, attached to the same `requestId` the frontend can quote.

Implementation:
- **`backend/src/instrument.ts` (new)** — initializes Sentry. **No-op if `SENTRY_DSN` is unset**, so dev and tests need zero changes.
- **`backend/src/main.ts`** — `import './instrument';` is the **first** line. This is required by `@sentry/node` so it can patch `http` and `async_hooks` before NestJS loads.
- **`backend/src/common/sanitized-exception.filter.ts`** — calls `Sentry.captureException()` for:
  - All unhandled errors (path that becomes a 500).
  - HttpExceptions with status ≥ 500. (4xx HttpExceptions are deliberately not reported — those are client mistakes, not bugs.)
  Each event includes a `request_id` tag (matching the `X-Request-Id` header from 3.2), `http.status` tag, and a `request` context with method + path + request_id. So when a friend pastes their error response into Slack, you can paste the `requestId` into Sentry's search and get the exact event with stack trace.

New env vars (documented in `backend/.env.example`):
- `SENTRY_DSN` — gates everything. Without it, the SDK is a no-op.
- `SENTRY_ENVIRONMENT` (optional, defaults to `NODE_ENV`)
- `SENTRY_RELEASE` (optional, defaults to `jim-api@<package version>`)
- `SENTRY_TRACES_SAMPLE_RATE` (optional, default `0` — errors only; raise to e.g. `0.1` later to sample performance traces)

Verified: backend lint, `tsc --noEmit`, `nest build` (`dist/src/instrument.js` present), all 134 unit tests pass.

**To activate on Render:**
- [ ] Create a **backend** Sentry project (separate from the React Native project — `@sentry/node` events should land in their own project so dashboards stay clean).
- [ ] Copy the server DSN from Sentry → Project Settings → Client Keys.
- [ ] Render → Environment → set `SENTRY_DSN=<dsn>` and `SENTRY_ENVIRONMENT=production`.
- [ ] Redeploy.
- [ ] Smoke test: hit any endpoint that throws (or temporarily add a `/api/health/boom` route, throw, then revert). Confirm the event lands in Sentry with `request_id` populated.

### 3.2 Request-ID correlation — ✅ DONE, DEPLOYED (2026-05-27)

**Status:** shipped in PR #1 (commit `4d9b33d`). Verified live: every response from `https://jim-app-l8o7.onrender.com/api/*` includes an `X-Request-Id` header.

**Implementation details (now live in production):**

Added `backend/src/common/request-id.middleware.ts`. Wired in `backend/src/main.ts` before helmet/body-parser. Updated `SanitizedExceptionFilter` to include the request ID in log lines and (for unhandled 500s) in the response body.

Behavior:
- Each request gets a UUID via Node's `crypto.randomUUID()`. If the request has an upstream `X-Request-Id` header that matches a safe regex (`[A-Za-z0-9_\-.]+`, ≤128 chars), that value is honored — useful if you put Cloudflare or a load balancer in front later.
- The same value is set on the response as `X-Request-Id`.
- `SanitizedExceptionFilter` log lines now include `"requestId": "..."`.
- For unhandled 500s, the JSON response body now includes `requestId` so testers can quote it: `{ "statusCode": 500, "message": "Internal server error", "requestId": "abc-123" }`.
- HttpException bodies are unchanged (the response header is already set; modifying the body could break client expectations).

Verified: backend lint, `tsc --noEmit`, and 134 unit tests all pass.

### 3.3 Health `/ready` probes Supabase + Groq — ✅ DONE, DEPLOYED (2026-05-27)

**Status:** shipped in PR #2 (commit `306d361`). Verified live: `curl https://jim-app-l8o7.onrender.com/api/health/ready` returns `{"status":"ready","checks":{"db":"ok","supabase":"ok","groq":"ok"},"timestamp":"..."}`.

The cold-start probe-timeout concern was moot in practice — Render's health check is already pointed at `/api/health` (liveness, fast) per `render.yaml`, not `/api/health/ready`. External monitors can still hit `/ready` for full status.

**Implementation details (now live in production):**

`/api/health/ready` reports the state of every external dependency, not just DB. New shape:

```json
{
  "status": "ready",          // or "degraded" / "unready"
  "checks": {
    "db": "ok",               // 'ok' | 'down'
    "supabase": "ok",         // 'ok' | 'down' | 'skipped' (if SUPABASE_URL unset)
    "groq": "ok"              // 'ok' | 'down' | 'skipped' (if GROQ_API_KEY unset)
  },
  "timestamp": "..."
}
```

HTTP status:
- **200 ready** — everything healthy
- **200 degraded** — DB ok but Supabase or Groq down (service is still usable; Render keeps it in rotation)
- **503 unready** — DB down (service cannot function)

Implementation:
- New `backend/src/health/health.service.ts`. Probes Supabase via `/auth/v1/.well-known/jwks.json` (the actual runtime dependency for token verification — `auth.service.ts:33` pulls keys from there). Probes Groq via `https://api.groq.com/openai/v1/models` (a free metadata endpoint that also validates the API key).
- 3s per-probe timeout via `AbortController`. 30s result cache for Supabase + Groq so frequent health checks don't hammer external APIs. DB is not cached — we want immediate signal on DB outages.
- `HealthController` updated to fan out all three probes in parallel with `Promise.all`, then map to status code.
- `HealthModule` now provides `HealthService`. `PrismaModule` is `@Global()` so no extra imports needed.

Verified: backend lint, `tsc --noEmit`, 134 unit tests all pass.

**Try it after deploy:**
```powershell
curl https://jim-app-l8o7.onrender.com/api/health/ready
```
You should see a JSON body with `checks` populated.

### 3.4 iOS permission usage descriptions — ✅ NO-OP (2026-05-26)

Audited `frontend/package.json` for permission-gated Expo packages. None present:

- ❌ `expo-camera`, `expo-image-picker`, `expo-av`, `expo-location`, `expo-sensors`, `expo-media-library`, `expo-notifications`, `expo-contacts`, `expo-calendar`, `expo-barcode-scanner`, `expo-tracking-transparency` — none installed.
- ✅ Only permission-free packages: `expo-file-system` (sandboxed cache writes), `expo-sharing` (system share sheet), `expo-linking`, `expo-secure-store` (keychain), `expo-status-bar`, `expo-constants`.

`frontend/src/lib/shareDataExport.ts` uses `FileSystem.cacheDirectory` + `Sharing.shareAsync` — both permission-free.

No `NS*UsageDescription` strings needed in `app.json`. If you add a new feature requiring camera/photos/etc. later, revisit this section.

### 3.5 Cold-install onboarding walkthrough — **MEDIUM**

The first-run flow is: SignUp → Onboarding (5 steps) → HomeScreen (empty). A new user has no plan, so the Home tab CTA must be unambiguous.

- [ ] Cold-install on a fresh iCloud account / device. Walk through end-to-end. Look for: dead-end empty states, confusing copy on the "Generate plan" CTA, modal that doesn't dismiss, missing loading spinner on plan generation.
- [ ] Sample screens to scrutinize: `HomeScreen.tsx`, `GeneratePlanScreen.tsx`, `PlanPreviewScreen.tsx`.

### 3.6 In-app support contact — ✅ FIXED (2026-06-02)

**Fixed:** `FEEDBACK_MAILTO` now sends to the dedicated support inbox `myjimplanner@gmail.com`, overridable via `EXPO_PUBLIC_FEEDBACK_EMAIL` (matches the `PRIVACY_POLICY_URL` / `TERMS_OF_SERVICE_URL` pattern in the same file; documented in `frontend/.env.example`). Tapping "Feedback & support" in `ProfileScreen` now opens the mail app pre-addressed.

**Historical context (the bug that was fixed)** — `frontend/src/constants/legalUrls.ts` previously read:

```ts
export const FEEDBACK_MAILTO =
  'mailto:?subject=Jim%20App%20feedback';
```

There's **no recipient address**. Tapping "Feedback & support" in `ProfileScreen` opens the user's mail app with the subject filled in but no `to:` field. A tester would have to type your email manually — they almost certainly won't, so this feedback channel is dead.

**Decided 2026-05-26: leave as-is for now.** Friends will get the TestFlight native "Send Feedback" button regardless, which captures screenshots and device info and is the higher-value channel anyway.

To fix later (low effort, low risk):
- [ ] Decide on a support email (a dedicated alias like `jim-app-feedback@…` is nicer than a personal address).
- [ ] In `frontend/src/constants/legalUrls.ts`, change to `mailto:<email>?subject=...`. Optionally make overridable via `EXPO_PUBLIC_FEEDBACK_EMAIL` to match the pattern used for `PRIVACY_POLICY_URL` and `TERMS_OF_SERVICE_URL` in the same file.

### 3.7 Accessibility labels on key interactive elements — **MEDIUM**

`GeneratePlanScreen.tsx` (~1700 lines) has only ~3 `accessibilityLabel` entries. Most form controls have none. Not gating for a friends-and-family beta, but plan to fix before public launch.

- [ ] Add `accessibilityLabel` to every `Pressable`, `Button`, and key icon in the main flow screens.

### 3.8 Verify account deletion and data export end-to-end — **MEDIUM**

`DELETE /api/users/me` and `GET /api/users/me/export` are implemented (per `docs/compliance-week2.md`). Make sure the UI paths still work after recent profile-screen polish commits.

- [ ] From `ProfileScreen`, request data export. Confirm a JSON file is delivered.
- [ ] From `ProfileScreen`, delete account. Confirm the Supabase user is removed, the app signs out, and signing back in fails as expected.

---

## 4. Pre-flight verification (run before every TestFlight upload)

Run this exact checklist before each `eas build --profile production --platform ios` and again before each `eas submit`:

- [ ] `cd backend && npm run lint` — green
- [ ] `cd backend && npm test` — green
- [ ] `cd frontend && npm run lint` — green
- [ ] `cd frontend && npm test` — green
- [ ] `curl https://jim-app-l8o7.onrender.com/api/health` → 200
- [ ] `curl https://jim-app-l8o7.onrender.com/api/health/ready` → 200
- [ ] All BLOCKER and HIGH items above are checked off
- [ ] Real iOS device cold-install flow:
  - [ ] Sign up with a fresh email
  - [ ] Complete onboarding (5 steps)
  - [ ] Generate a plan
  - [ ] Open today's workout, log a set, complete the workout
  - [ ] Sign out from Profile
  - [ ] Sign back in
  - [ ] Request password reset, tap the email link, set a new password
- [ ] Sentry dashboard shows the test event from this build
- [ ] App Store Connect shows: correct bundle ID, expected version, build number incremented from the previous upload
- [ ] No new commits since `npm test` was last run (or re-run if so)

---

## 5. APP-STORE-ONLY — defer until moving past internal TestFlight

These are **not blocking** for friends-and-family TestFlight (internal group, ≤100 testers invited by email, no Apple review). They **are blocking** for external TestFlight Beta App Review and for public App Store submission.

### 5.1 Hosted legal pages

- [ ] **Privacy policy URL** — hosted, HTTPS, in production. `docs/legal/privacy-policy.md` is a non-binding stub; treat it as a draft, get it counsel-reviewed (or use a generator like Termly), and host it on GitHub Pages or your marketing site.
- [ ] **Terms of Service URL** — same.
- [ ] Set `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` (see `frontend/src/constants/legalUrls.ts`) so the in-app footer links resolve.

### 5.2 Health & Fitness disclaimer in-app

Apple's Health & Fitness category expects a "not medical advice" disclaimer.

- [ ] Add a one-screen disclaimer modal or onboarding step: "This app provides fitness guidance, not medical advice. Consult a healthcare professional before starting any new exercise program."
- [ ] Optionally require an "I understand" acknowledgement on first run.

### 5.3 App Store Connect listing assets

- [ ] App name, subtitle, description (short and full)
- [ ] Keywords
- [ ] **Screenshots** for required device sizes (6.7", 6.5", 5.5" iPhone; 12.9" iPad if you support tablet — `app.json:19` has `supportsTablet: true`)
- [ ] App preview video (optional but boosts conversion)
- [ ] Support URL, marketing URL
- [ ] Category — Health & Fitness
- [ ] Content rating questionnaire (likely 4+ for a fitness app with no offensive content)

### 5.4 Compliance and rating answers

- [ ] **Export compliance** — almost certainly "uses standard encryption only / exempt." Confirm by reviewing the question.
- [ ] **Privacy Nutrition Label** in App Store Connect. Categories to declare for this app: Contact Info (email), Identifiers (Supabase user ID), Usage Data (Sentry/optional analytics), Health & Fitness (workout data).
- [ ] **Age rating** questionnaire.

### 5.5 Security / IDOR audit

Per `docs/MVP_REALITY_CHECK.md` §A1, generation endpoints may have IDOR vulnerabilities (e.g. `POST /api/plans/generate-sessions` and adjacent routes that take user-supplied IDs).

- [ ] Audit every route that accepts an ID from the client: confirm `req.user.id` is checked against the resource's owner before any DB or LLM call.
- [ ] Add integration tests for the negative case (user A tries to access user B's plan).

Acceptable risk for trusted friends; **not** acceptable for public launch.

### 5.6 Other deferred items

- [ ] Backend Sentry (see 3.1) — promote from MEDIUM to required for public launch.
- [ ] Request-ID correlation (see 3.2) — same.
- [ ] Backup-restore drill — `docs/backup-restore-drill.md` exists; run it once before public launch.

---

## 6. Known open work carried from memory

Things I (Claude) already track in auto-memory that intersect with launch:

- **Sign-out routing bug** (`project_signout_bug.md`) — root cause found & fixed, committed `b1c52e9`. Device-verify only, per 2.2.
- **Codebase audit in progress** (`project_audit_progress.md`) — 10 files reviewed; `GeneratePlanScreen.tsx` next. Not blocking but a known unfinished sweep that may turn up additional items for this checklist.

---

## 7. References — do not duplicate

Existing docs that already cover *what was built and why* — link to them rather than restating:

| Doc | Covers |
|-----|--------|
| [`production-checklist.md`](./production-checklist.md) | Backend ops, CORS, rate limits, CI, security headers (all ✓ done) |
| [`mobile-release.md`](./mobile-release.md) | EAS Build/Submit/Update workflow, store listings, password-reset deep link |
| [`go-live-verification.md`](./go-live-verification.md) | Fill-in checks for new host/domain (CORS, health URLs, secrets on provider) |
| [`MVP_REALITY_CHECK.md`](./MVP_REALITY_CHECK.md) | Severity A blockers + Week 1–4 roadmap |
| [`cors-production.md`](./cors-production.md) | CORS allowlist and Expo Web specifics |
| [`ai-rate-limits.md`](./ai-rate-limits.md) | Per-user burst + daily AI throttle |
| [`sentry-client.md`](./sentry-client.md) | Frontend Sentry wiring details |
| [`render-deploy.md`](./render-deploy.md) | Render backend deploy notes |
| [`security-hardening.md`](./security-hardening.md) | Helmet, body limits, no debug routes |
| [`database-production.md`](./database-production.md) | Supabase Postgres URL, pooler, backups |
| [`compliance-week2.md`](./compliance-week2.md) | Account deletion + data export status |
| [`backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md`](../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md) | LLM pipeline stages and known issues |

---

## Sign-off

Before clicking "Upload to TestFlight," confirm:

- [ ] All Section 1 (BLOCKERS) — checked
- [ ] All Section 2 (HIGH) — checked
- [ ] Section 4 (Pre-flight verification) — ran today, all green
- [ ] You have a phone within reach to verify the build once it processes
- [ ] You know how testers will report bugs (TestFlight native feedback + in-app email)

When Section 1, 2, and 4 are all checked, you are ready for friends-and-family TestFlight. Section 3 should be in flight during the beta. Section 5 is the gate for external TestFlight / App Store.
