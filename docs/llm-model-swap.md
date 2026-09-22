# Switching plan generation to Gemini 3.5 Flash-Lite

**Last reviewed:** 2026-09-14 · **Status:** BUILT 2026-09-14, eval at parity, deploying

## What shipped (2026-09-14)

- `backend/src/llm/llm-client.ts`: one client, `LLM_PROVIDER` (`gemini` default | `groq`)
  and `LLM_MODEL` env, JSON-schema output on both providers, thinking `MINIMAL`, 45 s
  timeout (`LLM_TIMEOUT_MS`), one retry on 408/429/5xx/network. All three prompts in
  `workout-generator.service.ts` go through `completeJson`; schemas in
  `workouts/generation-schemas.ts`.
- `LlmModelWatch`: asks the provider whether the model id exists 5 s after boot and
  every 24 h (daily rather than weekly, so a retirement is known within a day). Failure =
  error log + Sentry error event. `/api/health/ready` now reports `checks.llm` from the
  same check (`down` = degraded, never unready).
- Captures record `provider` + `model` per call and `meta.groq.model`; `eval:drive`
  takes `--provider=` / `--model=`. `scripts/test-llm-generate.ts` is the live probe.
- Privacy policy processor row: Google (Gemini API, paid tier). Frontend preview line
  says Gemini (ships with the next binary).

**Eval, same day.** Eight captured requests replayed (`--limit 8` report vs the 40
Llama-era captures): mean 137.3 / 140 vs 137.2, min 136, one 140; validator ok 100%,
fallback 0%, truncation 0%. Per dimension: fatigueStacking up (5.1 vs 4.5 of 6),
coachingProDepth (7.0 vs 7.3 of 8) and workoutOrder (7.1 vs 7.4 of 8) a touch down,
everything else at ceiling on both. About 10 s and 2 calls for a four-day week
(batch, validator retry), ~7–8k tokens, no thinking tokens billed at MINIMAL.
Rollback probe: `--provider=groq` (gpt-oss-120b) valid schema JSON in 0.6 s.

The app's only LLM, `llama-3.3-70b-versatile` on Groq, was retired on 16 August 2026.
Every plan since has come from the rule-based fallback. This is the swap plan: Gemini
3.5 Flash-Lite, chosen for quality per dollar (23 on the Artificial Analysis index vs 8
for the old model), speed (a plan in about 4 seconds) and a long runway (released
summer 2026, no shutdown announced; its predecessor 3.1 Flash-Lite retires 7 May 2027).

## Who can spend tokens: the beta allowlist (2026-09-15)

`AI_GENERATION_ALLOWLIST` on the backend (Render → Environment) is a comma
separated list of account emails and/or Supabase user ids, case-insensitive.
While it is set, only those accounts reach Gemini; every other generation is
served by the rule-based builder, logged as `[GenerationFallback] … reason=policy`
at info level and never sent to Sentry. Empty or unset = everyone (the switch is
meant to come off, not to stay). Dylan's call: test the paid model's spend
himself before the testers do.

Shape: `RequestActorMiddleware` opens a per-request context (AsyncLocalStorage),
`AuthGuard` records the verified actor on it, and `LlmClient.completeJson`
refuses with `LlmPolicyDeniedError` when the actor is not listed — before any
provider call, so nothing is billed. `checkModel` (health, the daily watch) is
not gated. A request with NO actor is denied too. Verified on the local rig with
two signed-in users: the listed one reached the provider, the other got
`reason=policy … is not listed`, both received a plan.

⚠ If the account signed in with Apple's Hide My Email, the JWT carries the
relay address, not the real one: list the Supabase user id instead (Supabase →
Authentication → Users), or both.

## The numbers

| | Old (Llama 3.3 70B) | Gemini 3.5 Flash-Lite |
|---|---|---|
| Model id | `llama-3.3-70b-versatile` | `gemini-3.5-flash-lite` |
| Price per 1M tokens (in / out) | $0.59 / $0.79 | $0.30 / $2.50 (thinking tokens bill as output) |
| Cost per plan (~4.5k in, ~2.4k out, week 1 only) | ~$0.005 | ~$0.007–0.010 |
| Cost per 1,000 plans | ~$5 | ~$7–10 |
| Speed | ~300 tok/s | ~365–490 tok/s |
| Structured output | JSON mode only | JSON schema, enforced |
| Thinking | none | on by default at `minimal`; keep it there |

Cost is not the constraint at any volume this app will see this year. Only week 1 of a
plan reaches the model; weeks 2–8 are cloned from it.

## Part 1 — What Dylan does (about 15 minutes)

1. **Create the API key.** Google AI Studio → Get API key → create it inside the existing
   Google Cloud project `jim-app-508300` (the one the OAuth consent screen lives in).
   Copy it once; it is shown once.
2. **Enable billing on that project (paid tier).** Not optional, for two reasons:
   - On the free tier Google uses prompts and responses to improve its products and
     human reviewers may read them. Our privacy policy says no training on user data.
     The paid tier's terms say Google does not use prompts to improve products.
   - Free-tier rate limits are for hobby use. Billing moves the account to Tier 1
     instantly; Tier 2 (higher limits) unlocks after $100 spent and 3 days.
   Set a budget alert in Google Cloud Billing at something like $20/month so a bug
   that loops generations cannot surprise you.
3. **Put the key where the backend runs.**
   - Render → the `jim-app` service → Environment → add `GEMINI_API_KEY`.
   - Local `backend/.env` → add the same line. (`backend/.env.example` gets the
     placeholder in the code change.)
   - Leave `GROQ_API_KEY` in place for now; it is the rollback path.
4. **Tell me it is done.** Everything else is code.

## Part 2 — What Claude does (one session)

1. **Make the model configuration, not code.** `LLM_PROVIDER` (`gemini` | `groq`) and
   `LLM_MODEL` env vars, with `gemini` + `gemini-3.5-flash-lite` as the defaults. The
   three call sites in `workout-generator.service.ts` go through one client function.
   Flipping back to Groq is an env change and a redeploy, no code.
2. **Install `@google/genai`** and call the model with JSON-schema structured output
   (the schema we already validate by hand becomes the enforced schema), thinking level
   `minimal`, an explicit output cap with headroom, a timeout and one retry.
3. **Make failure loud.** The rule-based fallback stays as a safety net but stops being
   silent: a boot-time check that the configured model id still exists (fails the
   `/health/ready` probe if not), a weekly scheduled version of the same check, and a
   Sentry alert when the "model answered but output unusable" rate climbs. This is the
   notification you asked for: a retired or misbehaving model pages you within a day,
   not after eleven.
4. **Run the eval harness on the new model.** `eval:drive` gets a `--model` flag; run it
   against the eight captured payloads and compare the 13-dimension scores with the
   Llama-era captures in `backend/logs/generation-captures/`. The harness scores exactly
   the failures you disliked: set/rep sanity, volume fit, equipment conformance.
5. **Update the privacy policy** (site/privacy): the AI row names Google's Gemini API
   (paid tier, prompts not used for training) instead of Groq. Redeploy the site.
6. **Deploy the backend**, generate one real plan end to end, confirm the capture shows
   `gemini-3.5-flash-lite` and a `stop` finish reason, and watch Sentry for a day.

## Part 3 — The three things still to check

Nothing here blocks anyone; the swap is live and healthy. These are the open loops.

| # | Check | Who | When | How |
|---|-------|-----|------|-----|
| 1 | **Sentry alert on repeated fallbacks** — DONE 2026-09-22: rule "Plan generation falling back to rules" (jimapp org, jim-api project, alert 6049117): message contains `Generation fell back to rules`, issue seen at least 5 times, notify suggested assignees then recently active members, throttled to one email per 3 hours per issue. The newer builder counts lifetime occurrences, not per hour. | Dylan | Any time, about 2 minutes | Sentry → Alerts → new issue alert on the message `Generation fell back to rules`, fired when it happens more than about 5 times in an hour. The events already exist and carry `generation.fallback_reason` and `generation.model` as tags. Not automatable from a Claude session: there is no Sentry API token on this machine. A *retired model* already emails on first occurrence without this rule, because `LlmModelWatch` raises an error-level event. This rule covers the other case, where the model answers but the answer is unusable. |
| 2 | **Generate one real plan from the phone** | Dylan | Next time the app is open | Make a plan, then look at the Render logs for `[LLM:generateFullProgram] model=gemini:gemini-3.5-flash-lite` and `finish_reason=stop`. ⛔ Deliberately not done from a Claude session: it needs a live Supabase session, and minting a JWT against the production secret risks `ensureUser` overwriting a real account's email. |
| 3 | **Billing and Sentry, a week in** — billing CHECKED by Dylan 2026-09-22, single dollars as expected | Either | On or after **2026-09-21** | Google Cloud Billing for project `jim-app-508300` should read single dollars for the month, against a prepaid $20 with auto-reload off. Sentry should show no `llm-unusable` warnings and no fallback-served plans. If a tester's plan does not read like a coach wrote it, the next candidate up is Claude Sonnet 5, roughly $0.03 a plan; see "A real second provider" in `docs/future.md`. |

A Claude session can do #3 as a read-only pass if asked, by reading Sentry and the
Render logs; #1 and #2 need Dylan.

## Rollback — read this before relying on it

⚠️ **The Groq path is a code path, not a dependable rollback.** Setting
`LLM_PROVIDER=groq` and `LLM_MODEL=openai/gpt-oss-120b` on Render does work in the
sense that the code runs: gpt-oss-120b was probed live on 2026-09-13 and again on
2026-09-14, returning valid schema JSON in about 0.6 s. But the account behind it is
the **free tier, which Groq is withdrawing** (Dylan, 2026-09-14; they emailed about
cutting off free API access back on 2026-08-25). Treat the key as something that can
stop answering without notice.

Even while it answers, the free tier cannot carry one plan. Measured on 2026-09-14, a
single ten-session request made two batch calls of 4,121 and 4,327 tokens, so about
**8.4k tokens inside twelve seconds** against a **8,000 tokens-per-minute** ceiling.
That is the throttling that produced fallback-served plans during earlier eval drives.

So today the honest position is: **Gemini is a single point of failure, and the safety
net under it is the rule-based builder, not another model.** That is survivable because
the fallback returns a real plan rather than an error, which is why this is a future
item and not an emergency. See "A real second provider" in `docs/future.md`.
