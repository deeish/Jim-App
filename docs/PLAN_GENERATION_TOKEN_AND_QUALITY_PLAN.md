# Plan generation: token savings and output quality

**Status:** Planning document — implement in phases as prioritized below.  
**Implemented (2026-04-14):** Phase A–C as above; batch split **4–7**; **Phase E:** multi-week copy + **targeted** preview regen (**week** / **cardio-only**) via `planPipeline`; **week 2+** uses **`simple`** LLM style when user picked **detailed** (backend). **Not yet:** hybrid (D), metric-driven limit tuning.  
**Related:** [backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md](../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md) (end-to-end flow and known issues).

**LLM provider:** Workout/session text is generated with **Groq** (`GROQ_API_KEY`, `groq-sdk`). That is distinct from xAI **Grok**. Some frontend debug fields still say “Grok” historically; the live integration is Groq.

## Problem statement

Plan preview generation can consume a large share of LLM tokens in a single user action. For some configurations it is difficult to complete even **one week** without heavy token use, and multi-week flows can be disproportionately expensive while risking truncated or invalid JSON output.

Goals:

1. **Reduce tokens** (input + output) per preview and per week of generation.
2. **Preserve or improve** session quality: coherent weeks, valid exercise IDs, sensible volume, and stable JSON.

---

## How generation works today (code map)

### Frontend

- **`frontend/src/lib/planPipeline.ts`**  
  - Stages 1–4 build structure locally.  
  - **`buildGenerateSessionsRequest`** flattens **all** `weekSpecs` into **one** `sessions[]` for a single **`POST /plans/generate-sessions`** call.

### Backend

- **`backend/src/plans/plans.service.ts`** — `generateSessions`  
  - First tries **`WorkoutGeneratorService.tryGenerateFullProgram`** (batch).  
  - On failure or ineligibility, falls back to a **loop** calling **`generateWorkout`** per session.

- **`backend/src/workouts/workout-generator.service.ts`**
  - **`tryGenerateFullProgram` / `generateFullProgram`** (batch): Groq `chat.completions` for **2–7** sessions (often **one** call; **split** into two on failure for 5–7 days), **~58** merged focus-specific candidates (tabular), **`max_tokens`** **4096** (detailed) or **3200** (simple).  
  - If `sessions.length < 2` **or** `> 7`, batch returns **`null`** and the service uses **per-session** generation.
  - **`generateWithGroq`** (per session): up to **72** candidates (richer JSON per exercise), long system/user prompts, **`max_tokens`** **3072** (detailed) or **2400** (simple).

### Why tokens spike

| Scenario | What happens |
|----------|----------------|
| **Multi-week preview** (e.g. 2×4 training days ⇒ 8 sessions) | Batch **never runs** (`> 7`). **Eight** full Groq calls, each with a large candidate list and large possible completion. |
| **Single-week batch** (2–7 sessions) | **One** call, but **output** can be very large (many days × many exercises × reasoning / warm-up / cool-down per day) → risk of **4096 cap** truncation or fragile JSON. |
| **Per-session fallback** | Prompt can be **larger per call** than batch (more fields per candidate, more instructions). |

Input size is also driven by **full exercise lists** embedded in every request (JSON or verbose structure).

---

## Guiding principles

1. **Prefer one coherent “week” per model call** over flattening many weeks into one array that exceeds batch limits.
2. **Shrink the catalog in the prompt** without removing exercises the model needs: focus-filter, anchors, compact encoding.
3. **Match output budget to detail level** and enforce caps that align with `exerciseTargetsForSession` (and cardio/recovery rules).
4. **Measure** before/after: token usage, batch success rate, parse failures, truncation (`finish_reason`).

---

## Phase A — Chunk generation by week (highest ROI)

**Objective:** Avoid N× full per-session Groq calls when the user selects multiple weeks.

**Preferred approach (implement first):** **Backend** — In `generateSessions`, partition `dto.sessions` by `weekIndex`, run `tryGenerateFullProgram` (or per-session fallback) **per chunk** (≤7 sessions each), then concatenate results in **the same order** as today’s API contract. One **`POST /plans/generate-sessions`** from the client keeps auth, throttling, retries, and observability in one place.

**Alternative:** **Frontend** — Split `buildGenerateSessionsRequest` into **one API call per `weekIndex`** (each ≤7 sessions), merge ordered results before Stage 6 normalization. Use when **wall-clock latency** matters more than a single round-trip; define behavior on **partial failure** (one week fails) and watch **per-user AI rate limits** if weeks are requested in parallel.

**Constraints:**

- Preserve the existing response shape: **`sessions`** array order must still align with what **`normalizeSessionsResponse`** in `planPipeline.ts` expects (match on `weekIndex` + `weekday`).

**Cross-week quality (after chunking):** Each week is a separate model call, so week 2 no longer “sees” week 1 in the same completion. Mitigation when multi-week preview should feel like one plan: pass a **compact list of exercise IDs (or names) already used in prior weeks** into the user prompt for week 2+ batches—similar in spirit to **`usedExerciseIdsByWeek`** on the per-session fallback path in `plans.service.ts`. Keep the block small to limit extra input tokens.

**Quality impact:** Positive — each batch still sees a **full week** of sessions when ≤7 training days per week.

---

## Phase B — Shrink prompts (input tokens)

**Objective:** Same or better exercise picks with fewer input tokens.

1. **Candidate limits**  
   - Revisit **`limit: 80`** (per-session) and **`limit: 65`** (batch). Tune down after measuring invalid-ID and backfill rates.  
   - Ensure **focus-aware** retrieval for batch path: today batch uses a **full-body** style candidate pull; consider **union of focus-specific** smaller lists or **per-day** filtering where safe.

2. **Compact exercise encoding**  
   - Replace large JSON arrays with a **minimal tabular** format (e.g. one line per exercise: `id`, short name, muscle) and state parsing rules once in the system prompt.

3. **Prompt hygiene**  
   - Deduplicate instructions; keep static rules in **system**; put only **day-specific** lines and constraints in **user**.

**Quality mitigation:** Keep **anchor** exercises first (`anchor-exercises`, `buildCandidateListWithAnchorsFirst`); rely on existing **backfill / validation** paths in `workout-generator.service.ts` when the model omits or mis-IDs exercises.

---

## Phase C — Control output size and failures

**Objective:** Fewer truncations, fewer malformed JSON responses, less wasted retry tokens.

1. **Detail level**  
   - For **`detailLevel === 'simple'`**: shorter reasoning / warm-up / cool-down in the schema text; **tighter exercise count ranges** in prompts; consider **lower `max_tokens`** when outputs are consistently shorter.

2. **Explicit caps in the prompt**  
   - Align max exercises per day with **`exerciseTargetsForSession`** (and cardio/recovery behavior) so the model does not “over-generate.”

3. **Truncation and parse failures**  
   - If completion **`finish_reason`** indicates length or JSON parse fails: **retry once** with reduced targets, or **split the batch** (e.g. 4+3 days) instead of failing the whole preview.

4. **Observability**  
   - Log **prompt_tokens**, **completion_tokens**, **`finish_reason`**, and **chunk path** per request (respect privacy/redaction policy).  
   - **Done (partial):** Groq lines from **`WorkoutGeneratorService`**; **`PlansService`** logs **`event":"generate_sessions_chunk"`** with **`path`** (`hybrid_ok`, `hybrid_quality_fallback`, `batch_ok`, `per_session`, …) — see **`backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md`**.

---

## Phase D — Hybrid generation (optional, larger project)

**Objective:** Large savings for scale or for “simple” previews.

1. **Rule-based or anchor-first skeleton** (`generateWorkoutByRules` and related).  
2. **Small second LLM pass:** short prompt for titles, brief “why,” and light reordering with **10–15** candidate IDs only.

**Tradeoff:** Quality depends on rule coverage; best scoped initially to **simple** detail or **regeneration** flows.

**Done (scoped):** For **`generate-sessions`** chunks where **`makeItEasier` is false** and **`effectiveDetailLevel === 'simple'`** (includes user-chosen **simple**, and **detailed** plans from **week 2+** where the backend already uses the simple Groq style), the server runs **`generateWorkout`** with **`skipGroq: true`** per day (same exclude / avoid behavior as the per-session fallback), then a single **`polishSimpleBatchSessionCopy`** Groq call (~900 `max_tokens`) for **`name`**, **`reasoning`**, **`warmUp`**, **`coolDown`** only—exercise lists stay fixed. If polish fails or there is no API key, rule-only copy is returned. A **quality gate** compares each day’s exercise count to **`exerciseTargetsForSession`** (simple); if any day is short, the chunk falls back to batch / per-session Groq. If any rule-only day throws, hybrid is skipped for that chunk. **`make-it-easier`** and **detailed week 1** skip this hybrid path.

---

## Phase E — Product / UX levers

- Default or guide users toward **1-week preview** when token cost matters.  
  - **Done (partial):** `GeneratePlanScreen` shows a hint when `weeks > 1`; `PlanPreviewScreen` loading copy when `planInputs.weeksCount > 1`. Default remains **1 week** in the form.
- **Regenerate single day** via **`POST /plans/generate-single-session`** (unchanged).  
- **Regenerate one preview week / cardio only** without redoing the whole plan: **`regeneratePipelineWeek`** and **`regeneratePipelineCardioSessions`** in `planPipeline.ts` call **`generate-sessions`** for only those sessions; **`PlanPreviewScreen`** uses them when **`planDraft`** is loaded (falls back to full **`runPipelineSafe`** if not).

---

## Suggested implementation order

| Priority | Work item | Rationale |
|----------|-----------|-----------|
| 1 | Chunk **`generate-sessions`** by week (≤7 sessions per Groq batch) | Fixes multi-week N× token blow-up; restores weekly coherence |
| 2 | Compact exercise list + tuned candidate **limits** | Cheap input wins; measure regressions |
| 3 | Token / **`finish_reason`** logging | Data-driven tuning |
| 4 | Simple vs detailed **output caps** and **`max_tokens`** | Reduces truncation; aligns cost with UX |
| 5 | Week 2+ lighter strategy or hybrid pipeline | **Partial:** UX hints + split retry + **backend** uses **`simple`** Groq prompts for **`weekIndex >= 2`** when user chose **detailed**; targeted week/cardio regen; **Phase D hybrid** for **simple** / week-2+ compact chunks (rules + polish pass) |

---

## Success metrics

- **Tokens:** Median and p95 total (prompt + completion) for: 1 week, 2 weeks, 4 days/week vs 6 days/week.  
- **Reliability:** Batch success rate; JSON parse success rate; rate of fallback to per-session.  
- **Quality:** Share of sessions meeting minimum exercise counts; spot-check variety on repeated focuses (e.g. two “Push” days); invalid or duplicate movement patterns (where you add checks).

---

## Files to touch (when implementing)

| Area | Files (non-exhaustive) |
|------|-------------------------|
| Request batching | `frontend/src/lib/planPipeline.ts`, `frontend/src/services/planService.ts` |
| Server orchestration | `backend/src/plans/plans.service.ts`, `backend/src/plans/plans.controller.ts` |
| LLM prompts and batching rules | `backend/src/workouts/workout-generator.service.ts` |
| Exercise retrieval | `backend/src/exercises/exercises.service.ts` (candidate limits/filters) |
| Docs / runbooks | `backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md` (update after behavior changes) |

---

## Revision history

| Date | Author | Notes |
|------|--------|-------|
| 2026-04-14 | — | Initial plan from architecture review |
| 2026-04-14 | — | Groq vs Grok note; Phase A default (backend chunking); cross-week exercise context |
| 2026-04-14 | — | Chronological prior-id window + Nest Logger for Groq metrics in prod; status line updated |
| 2026-04-14 | — | Phase B focus-union batch candidates, limits 58/72; Phase C split batch + caps + per-session max_tokens |
| 2026-04-14 | — | Phase E hints (multi-week); split retry extended to 4-session batches (2+2) |
| 2026-04-14 | — | Targeted week + cardio regen; week 2+ simple Groq when detailed selected |
| 2026-04-14 | — | Phase D hybrid: `skipGroq` rule sessions + `polishSimpleBatchSessionCopy` before full Groq batch (simple / non–make-it-easier chunks) |
| 2026-04-14 | — | Chunk path JSON logs + hybrid min-exercise quality gate; runbook (`PLAN_GENERATION_FLOW_AND_ISSUES.md`) updated |
