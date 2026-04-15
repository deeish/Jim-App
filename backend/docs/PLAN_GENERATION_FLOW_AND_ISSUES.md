# Plan Generation: How It Works, What’s Wrong, and What Can Go Wrong

**Last reviewed:** 2026-04-14 — Update when `generate-sessions`, hybrid/batch paths, or preview/regenerate behavior changes. See root [`docs/INDEX.md`](../../docs/INDEX.md).

## How it works (end-to-end)

### 1. User taps “Generate Week 1 Preview” (Generate Plan screen)

- Form state is turned into a **PlanInputs** snapshot (goal, days, duration, split, avoid list, etc.).
- App navigates to **Plan Preview** with `planInputs`, legacy `inputs`, and a new `draftId`.

### 2. Plan Preview loads and runs the pipeline

- **Stages 1–4 (sync, frontend)**  
  - **Stage 1:** Effective split (e.g. “upper_lower” or AI recommendation).  
  - **Stage 2:** Week skeleton: which weekdays are strength / cardio / recovery / rest (7‑day rule, selected days only).  
  - **Stage 3:** Template mapping (e.g. Upper, Lower, Upper, Lower for 4‑day U/L).  
  - **Stage 4:** **SessionSpecs** per week: type, title, duration, isHardDay, avoidConstraints, etc.

- **Stage 5 (async, backend)**  
  - Frontend builds a single request: context (goal, location, detailLevel, avoidConstraints) + one **session** object per non‑rest day (type, title, durationMin/Max, isHardDay, weekIndex, weekday).  
  - **POST /plans/generate-sessions** (auth required).  
  - Backend **partitions** `sessions` by `weekIndex` (in request order), in slices of **at most 7** training days per **chunk**. Chunks run **sequentially** (chunk 2 sees exercise ids picked in chunk 1 via a chronological tail → recency‑ordered uniques for prompts and **`excludeExerciseIds`**).  
  - For each chunk, **`PlansService.generateSessionsForSpecChunk`** picks a path:  
    1. **Hybrid (simple only)** — When **`makeItEasier` is false** and **`effectiveDetailLevel === 'simple'`** (user chose **simple**, or chose **detailed** but this chunk’s **`weekIndex` minimum is ≥ 2**, so later weeks use the compact style). Per day: **`generateWorkout`** with **`skipGroq: true`** (rule‑based exercises; same exclude / avoid pattern as per‑session fallback). Then **one** optional Groq JSON call **`polishSimpleBatchSessionCopy`** for titles + warm‑up / cool‑down / reasoning only (exercise lists unchanged). If polish fails or there is no API key, rule‑only copy is kept. A **quality gate** then checks each day’s exercise count against **`exerciseTargetsForSession(..., 'simple', …)`** (aligned with batch prompts). If any day is short, the chunk **falls through** to the paths below (no silent thin sessions). If rule generation fails for a day, hybrid is skipped for that chunk.  
    2. **Batch Groq** — If the chunk has **≥ 2** sessions: **`WorkoutGeneratorService.tryGenerateFullProgram`** (one Groq call for the whole chunk, or **two** calls if a **4–7** day batch hits length/parse issues and an internal **split** succeeds). Batch candidates are a **deduped union** of focus‑specific pulls (capped).  
    3. **Per‑session Groq** — If batch fails or the chunk is a **single** session: **`generateWorkout()`** once per day (Groq when key + enough candidates, else rules).  
  - **`WorkoutGeneratorService`** logs Groq **`finish_reason`** and token **usage** with labels like **`generateFullProgram`**, **`generateWithGroq`**, **`polishSimpleBatchSessionCopy`** (no prompt text). **`PlansService`** emits one structured **`generate_sessions_chunk`** line per chunk (see Observability).  
  - Returns name, reasoning, warmUp, coolDown, exercises (name, sets, reps, notes, exerciseId).  
  - Backend responds with `{ sessions: [ ... ] }` in the **same order** as the request. For **multi-week** previews with **`detailLevel: detailed`**, sessions in **`weekIndex >= 2`** use the **`simple`** prompt style (and hybrid when applicable); week 1 stays **detailed** unless the user chose **simple** overall.

- **Stage 6 (frontend)**  
  - Response is **normalized**: match each result to a week/day by `weekIndex` + `weekday`, and build **SessionDraft** (title, warmup, whyThisWorkout, cooldown, exercises).  
  - If `sessions.length !== request.sessions.length`, the pipeline **throws** and the UI shows “Couldn’t generate. Try again.”

- **Stage 7 (frontend)**  
  - Metrics (sessions per week, strength/cardio/hard counts) are computed from the draft.

- **Validation / repair**  
  - Draft is validated (every week has 7 days, correct weekdays).  
  - If invalid and `repairIfInvalid: true`, missing days are filled with rest; otherwise the run fails.

### 3. UI shows the plan

- Draft is converted to the legacy **WeekPlan[]** shape (week tabs, workouts per day).  
- User can regenerate week/cardio, make easier, swap, apply to plan, or edit inputs.

---

## Observability (metrics-friendly logs)

- **Chunk path (one line per ≤7-day slice)**  
  - **`PlansService`** logs a JSON string (Nest `Logger.log`) with **`event":"generate_sessions_chunk"`** and **`path`** among: **`hybrid_ok`**, **`hybrid_quality_fallback`** (hybrid built sessions but failed the min‑exercise gate → batch or per‑session ran), **`hybrid_rule_failed`**, **`hybrid_bad_shape`**, **`batch_ok`**, **`per_session`**. Also **`sessionCount`**, **`weekMin`**, **`effectiveDetailLevel`**, **`makeItEasier`**, and when relevant **`polishApplied`** (hybrid polish succeeded).  
  - In **production**, `JsonProductionLogger` wraps this in a single stdout JSON object; the inner payload is in **`msg`** as a string — parse **`msg`** as JSON for dashboards, or grep **`generate_sessions_chunk`** and **`path`**.

- **Groq usage (per completion)**  
  - **`[Groq:<label>] finish_reason=… prompt_tokens=…`** from **`WorkoutGeneratorService`** for batch / single‑session / polish calls.

---

## What’s wrong or inconsistent in the implementation

1. **Home equipment vs library**  
   - **`generateSessions`** passes a **home equipment list** into **`generateWorkout`** when `location === 'home'`. Candidate filtering still depends on how exercises are tagged in the library; edge cases (odd equipment strings) may still surface mismatches.

2. **detailLevel**  
   - Frontend sends **`detailLevel`**; it drives prompts, caps, hybrid eligibility, and **`effectiveDetailLevel`** for week 2+ when the user chose **detailed**. If the UI still feels identical between modes, tighten copy or UI hints.

3. **`generate-sessions` client timeout**  
   - **Done:** **`planService.generateSessions`** sets **axios `timeout: 90_000`**. **`planPipeline`** maps **`ECONNABORTED` / ETIMEDOUT / “timeout”** messages to a single user string; **Plan Preview** uses **Request timed out** as the card title (and regeneration alerts use the same title when that string matches).  
   - **Still optional:** raise the cap (e.g. 120s) for very large previews, or add per‑chunk progress in the UI.

4. **Regenerate behavior (Plan Preview)**  
   - With an existing **`planDraft`**, **regenerate week** / **regenerate cardio** call **`generate-sessions`** only for that week’s slots or only **cardio** slots, then merge (**`regeneratePipelineWeek`** / **`regeneratePipelineCardioSessions`** in `planPipeline.ts`).  
   - **Make it easier** still runs the **full** pipeline (**`runPipelineSafe`** with **`makeItEasier`**) so intensity stays coherent; hybrid is **not** used when **`makeItEasier`** is true.

---

## Issues you might run into (in practice)

### Latency and timeouts

- **Many sessions = long wait**  
  - Backend runs **one path per chunk** (often **hybrid_ok** with one small polish call, or **one Groq batch** per slice of up to 7 days), then the next chunk; within a chunk, **per_session** fallback is **one** `generateWorkout()` per day **sequentially**. Multi‑week eight training days ⇒ typically **two chunks**, not eight independent full batches (fewer tokens when hybrid or batch succeeds).  
  - User sees “Generating Week Preview…” for the whole time. If the backend or Groq is slow, they may think the app is stuck.  
- **Mitigation:** Loading copy + **90s** client timeout (see §3); optional later: per‑chunk progress (e.g. “Generating 2/4…”).

### Backend / Groq failures

- **One session fails ⇒ whole request fails**  
  - If any `generateWorkout()` throws (Groq error, parse error, etc.), `generateSessions` throws and returns 5xx.  
  - Frontend gets an error and shows “Couldn’t generate. Try again.” (no partial plan).  
- **Missing or invalid JSON from Groq**  
  - The generator already falls back to rule‑based when Groq fails; if both paths failed we’d throw. So you only see a generic error unless you log on the backend.

### Auth and network

- **401 on generate-sessions**  
  - Endpoint is behind `AuthGuard`. If the token is missing or expired, the client gets 401 and the global interceptor may sign the user out.  
  - User would need to sign in again and retry.  
- **Network errors**  
  - Any network failure (no internet, server down) causes the pipeline to throw and the same “Couldn’t generate. Try again.” + Retry.

### Content quality

- **Avoid list only in prompt**  
  - “Avoid overhead” and similar are passed as `avoidConstraints` and used in the generator’s prompt. The model might still occasionally suggest overhead work; there’s no strict post‑validation that removes such exercises.  
- **No per‑exercise validation**  
  - We don’t check that exercise names or IDs exist in your library. If Groq returns an unknown or made‑up exercise, it still appears in the plan (with whatever name/ID it returned).

### Multi‑week plans

- **Weeks > 1**  
  - One request still carries **all** preview weeks; the backend processes **chunks** of at most **7** training days per week slice. Two weeks × four days is typically **two chunks** (often **hybrid_ok** or **batch_ok** each), not eight separate batch calls. Latency scales with chunk count and **per_session** fallbacks.

### Response length check

- **Strict count check**  
  - We require `sessions.length === request.sessions.length`. If the backend ever returns fewer (e.g. bug or partial failure that still returns 200), the frontend throws and shows an error.  
  - That’s intentional so we never show a half‑filled week.

---

## Quick reference

| Area | Current behavior | Risk / limitation |
|------|------------------|-------------------|
| Location (gym/home) | Home passes **`HOME_EQUIPMENT`** into **`generateWorkout`** | Library tagging / naming can still mismatch real home setups |
| detailLevel | Drives prompts, caps, hybrid, and **week 2+** compact style when user chose **detailed** | UX may still feel subtle between simple/detailed |
| Hybrid + quality gate | Thin rule-only days fall back to **batch** / **per_session** | Extra latency when **`hybrid_quality_fallback`** happens |
| Chunk logging | **`generate_sessions_chunk`** JSON per chunk with **`path`** | Parse **`msg`** in prod JSON logs |
| Timeout | **`generate-sessions`** uses a **90s** axios timeout in **`frontend/src/services/planService.ts`**; **`planPipeline`** turns abort/timeout into a fixed user string; preview shows **Request timed out** as the title | Multi-week or slow Groq may still need retry or a one-week preview |
| Regenerate | Targeted week/cardio merge when **`planDraft`** exists | **Make it easier** = full pipeline |
| One session fails | Whole **`generateSessions`** throws | No partial plan; user must retry |
| Auth | Required; 401 can trigger sign-out | Expired token = sign in again |

Fixing remaining gaps (stricter home filtering, optional longer timeout) and watching **`path`** + Groq token logs will make behavior easier to tune and debug.
