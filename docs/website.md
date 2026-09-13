# jimplanner.app

Static marketing + legal site, served by Cloudflare Pages from `site/`.

**Last reviewed:** 2026-09-13

| Path | What |
|------|------|
| `site/index.html` | Homepage for "Jim: Workout Planner" (beta CTA is a mailto to support) |
| `site/privacy/` | Privacy policy. Written to match what the app actually does; re-read it whenever a data flow changes (new provider, new field, Apple Health). |
| `site/terms/` | Terms of service |
| `site/site.css` | The app's palette + system type, light and dark |
| `site/favicon.png`, `site/apple-touch-icon.png` | Copies of `frontend/assets/favicon.png` and `icon.png` |

## Deploy

```bash
npx wrangler@latest pages deploy site --project-name jim-planner --branch main
```

Needs a Cloudflare login (`npx wrangler login`) or `CLOUDFLARE_API_TOKEN` with Pages edit
rights. The project's custom domain is `jimplanner.app` (DNS already on Cloudflare).
There is no build step: what is in `site/` is what ships.

## Where the URLs are used

- Google Cloud OAuth consent screen (homepage + privacy + terms; project `jim-app-508300`).
- App Store Connect: privacy policy URL (required for public release), support URL.
- The app: `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` in every
  `eas.json` profile (Profile → About rows and the sign-in legal line read them), and
  `EXPO_PUBLIC_FEEDBACK_EMAIL=support@jimplanner.app`.

## Not lawyer-reviewed

Both legal pages are written by us for the beta and are honest about what the app does.
Have counsel review before public launch. The terms' governing-law state is Dylan's call.
