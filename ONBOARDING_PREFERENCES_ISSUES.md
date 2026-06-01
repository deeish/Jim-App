# Onboarding / User Preferences — Data-Linkage Issues

**Status:** partially fixed — found during review on 2026-05-28.
**Scope:** how onboarding selections are stored and linked to a user account.

**Resolution (2026-05-28):** implemented **per-user keying + reset-on-sign-out**.
Preferences now persist under `jim_user_preferences_v1:<userId>`, re-hydrate when
the signed-in user changes, reset to defaults on sign-out, and a one-time
migration moves any legacy device-global data into the first user's key. This
resolves issues **#1, #2, #4, #5**. Issue **#3 (multi-device / reinstall)
remains open** — it requires server-side persistence.
Changes: `frontend/App.tsx` (provider order), `frontend/src/contexts/UserPreferencesContext.tsx`.

## TL;DR

Onboarding selections (goal, experience, equipment, training days, injury
tags/notes, display name, avatar, `hasCompletedOnboarding`) are persisted to a
**single device-global AsyncStorage key** — they are **not linked to the user
account**. They are not keyed per user, not synced to the backend, and not
cleared on sign-out. On a shared device this leaks one user's data (incl. health
notes) into another account and skips onboarding for the second account.

## How the flow actually works (context)

- Onboarding is **session-gated**: `frontend/App.tsx` only routes to
  `Onboarding` when a Supabase `session` already exists (see the
  `session ? (...) : <AuthStack/>` branch, ~L109–123). So in production the
  account exists *before* onboarding runs.
- The only no-account path into onboarding is the `__DEV__ && previewOnboarding`
  preview, which dead-ends at the `DevPreviewDone` placeholder (dev-only).
- Preferences live in `frontend/src/contexts/UserPreferencesContext.tsx`,
  persisted to AsyncStorage under `STORAGE_KEY = 'jim_user_preferences_v1'`
  (constant, **not** per-user). Hydrated once at app start; never re-keyed.
- `frontend/src/contexts/AuthContext.tsx` `signOut()` clears the Supabase
  session/user but **does not touch** the preferences key (~L141–154).
- The backend has **no per-user preferences/profile store** — it only receives
  goal/equipment/injuries as *generation parameters* on the plan/workout
  endpoints. Nothing persists preferences server-side.

## Root cause

In `frontend/App.tsx`, `UserPreferencesProvider` **wraps** `AuthProvider`
(~L149–150), so the preferences layer architecturally cannot see who is logged
in. That is why storage is device-global rather than account-scoped.

## Issues

### 1. Cross-account data leakage on a shared device — HIGH — ✅ FIXED
- **Repro:** User A completes onboarding → signs out → User B signs up / logs in
  on the same device.
- **Result:** `hasCompletedOnboarding` is still `true`, so User B **skips
  onboarding entirely** (`App.tsx` picks `initialRouteName='Main'`) and
  **inherits A's** goal, experience, equipment, training frequency/days, injury
  tags/notes, display name, and avatar. B's generated plans use A's data.

### 2. Personal/health data exposed across accounts — HIGH (privacy) — ✅ FIXED
- A consequence of #1: User A's **injury notes** (free-text health info) and
  **display name** are visible to User B on the same device.

### 3. No restore on reinstall / new device — MEDIUM — ⬜ OPEN (needs server-side persistence)
- **Repro:** An existing user logs in on a new phone or after reinstalling.
- **Result:** local prefs are empty → `hasCompletedOnboarding=false` → user is
  **forced to re-onboard**, and prior preferences are lost (never stored
  server-side). The data was never actually linked to the account.

### 4. Sign-out does not reset preferences — HIGH (enabler of #1/#2) — ✅ FIXED
- `AuthContext.signOut()` clears the session but leaves
  `jim_user_preferences_v1` in AsyncStorage. This is what allows #1 and #2.

### 5. Dev "Preview onboarding" writes to real storage — LOW (dev footgun) — ✅ FIXED
- Finishing the `__DEV__` onboarding preview calls `completeOnboarding()`, which
  writes `hasCompletedOnboarding=true` (and any selected prefs) to the **real**
  global key. A subsequent real account on that build then skips onboarding.

## Not an issue (verified)

- The `handleNext` → auto-generate-plan flow at the end of onboarding is fine:
  the session already exists, so the authenticated `generate-sessions` call
  works, and the just-set preferences are readable in the same session.

## Fix options

- **Minimum (fixes #1, #2, #4):** On sign-out, clear preferences
  (`AsyncStorage.removeItem(STORAGE_KEY)`) and reset the context to `DEFAULTS`.
  Next account starts clean; #3 still re-onboards (acceptable).
- **Better (fixes #1–#3 locally):** Scope the storage key per user —
  e.g. `jim_user_preferences_v1:<userId>` — and re-hydrate when the auth user
  changes. Requires `UserPreferencesProvider` to know the user, i.e. **move it
  inside `AuthProvider`** in `App.tsx` (or bridge the user id in).
- **Best (fixes everything incl. multi-device):** Persist preferences to the
  backend per user (a profile/preferences endpoint) and load them on login.
  Larger change, but the only option that survives reinstall / new device and
  truly links the data to the account.

**Recommendation:** do per-user keying + clear-on-sign-out now (kills the
dangerous cross-account leakage and the privacy exposure); put server-side
persistence on the roadmap for multi-device.

## Files involved

- `frontend/src/contexts/UserPreferencesContext.tsx` — storage key, hydration, persist.
- `frontend/src/contexts/AuthContext.tsx` — `signOut()` (add reset).
- `frontend/App.tsx` — provider order (`UserPreferencesProvider` vs `AuthProvider`).
- `frontend/src/screens/OnboardingScreen.tsx` — `handleNext` writes prefs + completes onboarding.
- Backend (future): a per-user preferences/profile endpoint for option 3.
