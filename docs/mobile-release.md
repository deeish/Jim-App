# Mobile release path (Expo / EAS)

This repo includes **`frontend/eas.json`** so you can use **EAS Build**, **Submit**, and optionally **EAS Update**.

## One-time: link an Expo project

From the **`frontend`** directory:

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest init
```

`eas init` creates the project on Expo’s servers and writes **`expo.extra.eas.projectId`** into **`app.json`** (or `app.config.*`). Commit that change.

## Build

```bash
cd frontend
npx eas-cli@latest build --profile preview --platform android   # internal / APK
npx eas-cli@latest build --profile staging --platform android   # staging parity builds (internal, channel staging)
npx eas-cli@latest build --profile production --platform all      # store-ready
```

- **preview** — internal distribution, Android APK, channel `preview`.
- **staging** — internal distribution, channel **`staging`** (see **`docs/staging-environment.md`**).
- **production** — Play/App Store style builds, version auto-increment remote, channel `production`.

Configure Apple Team ID / credentials when EAS prompts (iOS).

## Submit to stores

After a successful production build:

```bash
cd frontend
npx eas-cli@latest submit --profile production --platform ios
npx eas-cli@latest submit --profile production --platform android
```

Follow EAS prompts for App Store Connect / Play Console API keys or uploads.

## EAS Update (JavaScript-only fixes)

Channels are defined in **`eas.json`** (`preview` / `production`). To ship OTA updates:

1. Install the runtime library (once):  
   `npx expo install expo-updates`
2. Finish [EAS Update setup](https://docs.expo.dev/eas-update/getting-started/) (e.g. `runtimeVersion` / `updates.url` as per current Expo docs).
3. Publish:  
   `npx eas-cli@latest update --channel production --message "Fix: …"`

OTA updates do **not** replace store review for native binary changes.

## Store listings checklist

Do in App Store Connect / Google Play (copy can live in a doc or spreadsheet):

- [ ] App name, short description, full description  
- [ ] Screenshots (required sizes per platform)  
- [ ] Support URL (email or web)  
- [ ] Privacy policy URL (**required** — host a simple page; link it in both consoles)  
- [ ] Content rating questionnaire  
- [ ] Category, keywords (iOS)

## Privacy policy

You must publish a URL (GitHub Pages, your marketing site, etc.) that describes:

- What data you collect (accounts, workout data, analytics, etc.)  
- Third parties (e.g. Supabase, Groq, Expo)  
- Contact for privacy requests  

Replace placeholder links in store forms with the live URL.

## Crash reporting (Sentry)

Optional: set **`EXPO_PUBLIC_SENTRY_DSN`** and use EAS secrets **`SENTRY_AUTH_TOKEN`**, **`SENTRY_ORG`**, **`SENTRY_PROJECT`** for symbolicated stack traces on release builds. See **`docs/sentry-client.md`**.

## API keys and `EXPO_PUBLIC_*`

Anything prefixed with **`EXPO_PUBLIC_`** is embedded in the client bundle — **treat it as public**.

| Safe in `EXPO_PUBLIC_*` | Not safe (server / EAS secrets only) |
|-------------------------|--------------------------------------|
| Supabase **anon** key   | Supabase **service role** key        |
| Public API base URL     | Groq / OpenAI keys                   |
| Supabase project URL    | Database passwords                   |
| Sentry **DSN** (client) | Sentry **auth token** (EAS secret only) |

LLM and other secrets belong in **`backend`** env (e.g. `GROQ_API_KEY`), not in the Expo app.

Optional: use **EAS Secrets** for values injected at build time that must not be committed — still assume determined users can extract in-app constants; never put true secrets in the client.

## Password reset (deep link)

The app uses **`expo-linking`** and **`app.json` → `scheme`: `jimapp`**. In **Supabase → Authentication → URL Configuration**, add **Redirect URLs** that include:

- **`jimapp://**`** (or your chosen scheme) so recovery emails can return to the native app.
- Expo dev URLs if you test recovery in development (e.g. `exp://…` / Metro — copy from `Linking.createURL` logs if redirects fail).

Without these, “Send reset link” may succeed but the email link will not open the app correctly.

## Related backend config

Production API URL: set **`EXPO_PUBLIC_API_BASE`** (see `frontend/.env.example`) to your HTTPS API root **without** `/api` (the app appends `/api`). Ensure that browser origin is listed in **`CORS_ORIGINS`** on the backend if you ship **Expo Web**.
