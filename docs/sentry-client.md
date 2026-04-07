# Sentry (Expo client)

Crash and error reporting uses [**@sentry/react-native**](https://docs.sentry.io/platforms/react-native/) (`frontend/src/lib/sentry.ts`). Initialization runs only when **`EXPO_PUBLIC_SENTRY_DSN`** is set.

## Environment tagging

| Source | Tag / field |
|--------|-------------|
| **`EXPO_PUBLIC_APP_ENV`** | Sentry `environment` when set (e.g. `preview`, `staging`, `production`). |
| Default | `development` when `__DEV__`, otherwise `production`. |
| Release | `{app slug}@{app version}` from Expo config (e.g. `jim-app@1.0.0`). |
| User | Supabase user **id** only after sign-in (no email). |

## EAS Build: source maps

1. Create a Sentry project and note **organization slug** and **project slug**.
2. Add [**Organization auth token**](https://sentry.io/settings/auth-tokens/) as EAS secret **`SENTRY_AUTH_TOKEN`** (used by the Sentry CLI during builds).
3. Set EAS secrets (or local env for `eas build`) **`SENTRY_ORG`** and **`SENTRY_PROJECT`** to match Sentry.  
   **`frontend/app.config.js`** swaps in the full `@sentry/react-native/expo` plugin when both are present so uploads can be configured correctly.

See also [Expo + Sentry](https://docs.expo.dev/guides/using-sentry/) and [Sentry × EAS](https://docs.sentry.io/platforms/react-native/sourcemaps/uploading/expo/).

## Privacy

The DSN is **public in the bundle** (same class as `EXPO_PUBLIC_*`). Do not put secrets in Sentry `beforeSend`; user ids are intentionally minimal. Mention Sentry in your privacy policy if you enable it.

## Related

- **`docs/mobile-release.md`** — EAS secrets and store checklist.
