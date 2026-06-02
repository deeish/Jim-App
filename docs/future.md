# Future ideas

## Optional logging without full workout flow

Some users may want planned workouts **visible** (Plan / Workout preview) without running the live session (sets, finish screen, `saveWorkoutLog`). Today, **History** only reflects in-app completed sessions.

**Later:** consider a lightweight path—e.g. “Mark done” / quick log for sessions completed elsewhere, or manual duration-only entry—so History can reflect reality without forcing the full flow.

## Add a lift that isn't in the DB

**Later:** log movements without a canonical `exerciseId` (e.g. free-text name, optional library match, or stub) and define how **History** shows them.

## Make sure history also stores reps/sets, etc...

## Server-side user preferences (multi-device / reinstall restore)

Onboarding selections (goal, experience, equipment, training days, injury tags/notes, display name, avatar, `hasCompletedOnboarding`) are persisted **locally only** — per-user in AsyncStorage under `jim_user_preferences_v1:<userId>` (`frontend/src/contexts/UserPreferencesContext.tsx`). Cross-account leakage on a shared device is fixed (per-user keying + reset on sign-out), but there is **no server-side store**, so an existing user who logs in on a new phone or after reinstalling lands with empty prefs → `hasCompletedOnboarding=false` → forced to re-onboard, and prior preferences are lost.

**Later:** add a per-user preferences/profile endpoint on the backend, write prefs on change, and load them on login (merging with local). This is the only option that survives reinstall / new device and truly links the data to the account. Until then, preferences are device-local by design.

Caveat to address alongside this: injury notes (free-text health info) currently sit in plaintext AsyncStorage, not SecureStore — fine for in-app cross-account isolation, but readable at rest on a compromised/rooted device.
