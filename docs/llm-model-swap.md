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

## Part 3 — Checks a week later

- Google Cloud Billing: spend is in the single dollars for the month.
- Sentry: no `llm-unusable` warnings, no fallback-served plans.
- A tester's plan looks like a coach wrote it. If not, the next candidate up is Claude
  Sonnet 5 (best on quality, ~$0.03/plan, ~15 s/plan), and the env switch makes trying
  it a one-line change plus an Anthropic key.

## Rollback

Set `LLM_PROVIDER=groq` and `LLM_MODEL=openai/gpt-oss-120b` on Render and redeploy.
gpt-oss-120b was probed live on 2026-09-13: valid JSON five of five at low reasoning
effort in under two seconds. The Groq account is on the free plan (8,000 tokens/min);
upgrade it to Developer if the rollback ever has to carry real traffic.
