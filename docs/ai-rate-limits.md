# AI / Groq rate limits

Groq-backed routes are rate-limited to limit cost abuse and accidental overload. Limits apply **per HTTP request**; one request that triggers multiple internal LLM calls still counts once.

## Protected routes

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/workouts/generate` | Generate and save workout |
| `POST` | `/api/workouts/preview` | Preview without save |
| `POST` | `/api/plans/generate-sessions` | Plan pipeline session fill |
| `POST` | `/api/plans/generate-single-session` | Single session generation |

All require auth (`AuthGuard` runs before the rate limit guard).

## Configuration

Set in the **backend** environment (see `backend/.env.example`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `AI_RATE_BURST_MAX` | `12` | Max requests in the burst window |
| `AI_RATE_BURST_WINDOW_MS` | `60000` | Burst window (ms), e.g. 1 minute |
| `AI_RATE_DAY_MAX` | `120` | Max requests in the day window |
| `AI_RATE_DAY_WINDOW_MS` | `86400000` | Day window (ms), e.g. 24 hours |

The tracker is `ai:user:<userId>` from `req.user.id`, or `ai:ip:<ip>` if no user (should be rare on these routes).

## Client behavior

When limited, the API responds with **429 Too Many Requests** (Nest `ThrottlerException`). The app should show a friendly “try again later” message.

## Monitoring

Rate-limit events are logged at **warn** level:

```text
AI rate limit exceeded: ai:user:… path=… limit=… totalHits=… key=…
```

Point your log aggregator at these lines for dashboards or alerts. For precise Groq token/cost metrics, add vendor or custom instrumentation separately.

## Public exercise catalog (separate limits)

Unauthenticated `/api/exercises` routes use **`catalogBurst`** and **`catalogDay`** (per IP), not the AI throttlers. See [`docs/exercises-public-api.md`](exercises-public-api.md).

## Multiple API instances

The default storage is **in-memory**. Each instance has its own counters, so effective limits scale roughly with instance count in the same window. For strict global limits across replicas, configure a **Redis** (or compatible) storage for `@nestjs/throttler` in code.
