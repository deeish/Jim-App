# CORS in production

The API uses an **allowlist** of `Origin` values (browser requests). It does **not** use `origin: true`.

## Configuration

Set **`CORS_ORIGINS`** in the backend environment (comma-separated, no spaces required):

```env
CORS_ORIGINS=https://your-app.web.app,https://dashboard.yourapp.com
```

- **Production:** `CORS_ORIGINS` is **required** (`NODE_ENV=production`). The app will fail to start if it is missing or empty.
- **Development:** If unset, a set of common **localhost** Expo / Metro URLs is used. Override anytime with `CORS_ORIGINS`.

## React Native vs web

- **Native apps** (iOS/Android) usually **do not** send an `Origin` header. Those requests are **allowed** so the API keeps working.
- **Expo Web** (or any browser) **does** send `Origin`. That value must appear in `CORS_ORIGINS`, or the browser will block responses.

## Tunnel / preview URLs

Expo tunnels (e.g. ngrok) use changing HTTPS origins. Add each origin you use, or run the web client against a stable URL that you list in `CORS_ORIGINS`.

## Credentials

`credentials: true` remains enabled so cookie / credential-based flows still work when paired with an allowed origin.
