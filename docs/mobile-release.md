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

## TestFlight tester distribution (automated)

After `eas submit` uploads a build, assigning it to tester groups no longer
needs App Store Connect clicking:

```bash
cd frontend
node scripts/testflight-distribute.mjs status      # recent builds + processing state
node scripts/testflight-distribute.mjs groups      # tester groups (internal/external)
node scripts/testflight-distribute.mjs distribute --group "Friends/Family" --wait
node scripts/testflight-distribute.mjs distribute --group "Friends/Family" --build 14
```

On Windows, `npm run tf:distribute -- --flag` mangles the extra flags, so call
the script directly as above. `npm run tf:status` / `tf:groups` are fine since
they take no arguments.

**Internal groups need no command at all.** App Store Connect gives internal
testers every build as soon as it finishes processing, and rejects an explicit
assignment with HTTP 422. Passing an internal group is harmless — the script
reports it and skips it — but the build is already available to them.

Adding a build to an **external** group does **not** start Beta App Review by
itself — the build sits at `externalBuildState=READY_FOR_BETA_SUBMISSION`
until a review submission is created (discovered on build 18, which needed a
manual submission). After assigning external groups, the script now makes
that submission automatically, and skips it when the build is already in or
past review. The demo review account is already configured in ASC.
`status` shows each build's external review state.

### How the build gets picked

With `--build <n>` the choice is explicit and nothing is guessed. Without it,
the script takes the newest upload **only if it landed within the last 45
minutes** (`--recent-minutes` to change), on the reasoning that a build you
just submitted is minutes old. `--wait` then polls up to 30 minutes for such a
build to appear and finish processing.

That rule exists because both halves of the obvious approach have already
failed in practice:

- **Build 12** — ASC had not registered the upload yet, so "latest" was still
  build 11 from days earlier, and 11 was distributed by mistake.
- **Build 14** — Apple processed the upload in about two minutes, so "latest"
  already *was* the new build. A version that waited for something newer than
  the startup latest sat there and timed out after 30 minutes.

Recency separates those two cases; "newer than whatever was latest at startup"
cannot, because which one happens depends on how fast Apple is that day.

**One-time setup:** App Store Connect → Users and Access → Integrations →
Team Keys → **Generate API Key** with role **App Manager**. Download the
`.p8` (offered exactly once), drop it in `frontend/` (gitignored via `*.p8`),
and set in `frontend/.env`:

```
ASC_API_KEY_ID=XXXXXXXXXX
ASC_API_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ASC_API_KEY_PATH=./AuthKey_XXXXXXXXXX.p8
```

The script (`frontend/scripts/testflight-distribute.mjs`) has no dependencies;
it signs the ASC JWT with Node's built-in crypto. Full release sequence:

```bash
npx eas build --profile production --platform ios --non-interactive
npx eas submit --profile production --platform ios --latest --non-interactive
# internal testers already have it at this point; for external:
node scripts/testflight-distribute.mjs distribute --group "Friends/Family" --wait
```

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
