# Generate Plan UI → pipeline → AI: what actually drives generation

**Last reviewed:** 2026-04-17  
**Audience:** Product and engineering — answers “are my Generate Plan choices used in AI generation?” and outlines a path toward **coach-grade** weeks while keeping **Groq** (not xAI Grok) token use disciplined. Preview generation uses **`POST /plans/generate-sessions`** and **`WorkoutGeneratorService`** as today.

**Related:** [PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md](./PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md), [../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md](../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md), [../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md](../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md) (low-cost prompt/UI gaps: rest, notes, weights, structure). **Next quality roadmap:** [TRAINER_QUALITY_AND_ADVICE_PLAN.md](./TRAINER_QUALITY_AND_ADVICE_PLAN.md) (smarter / more realistic trainer advice, phased).

---

## Short answer

**Yes — for the core schedule, the model is steered by a structured week you already computed on the client.** Stages 1–4 in `frontend/src/lib/planPipeline.ts` turn `PlanInputs` into per-session **type** (strength / cardio / recovery), **focus title** (for example Upper, Lower, Push), **duration band**, **hard-day flag**, and **avoid phrases**. The backend Groq path (`POST /plans/generate-sessions` → `WorkoutGeneratorService.generateFullProgram` or fallbacks) receives those session rows plus **goal**, **gym vs home**, **detail level**, **global avoid list**, and **cardio modality hints**.

**No — not every control on Generate Plan is in that snapshot.** Several fields are still only in legacy `inputs` for Plan Preview and **do not** go to `generate-sessions`. **Experience** and **gym equipment checklist** are now on `PlanInputs` and the DTO (2026-04-17); other advanced options may remain unwired. Plan Preview lists those under **“Also on Generate Plan (not in the AI request)”** (2026-04-17).

Workouts can still look less bespoke than a 1:1 coach for **micro-periodization** and every advanced toggle — remaining gaps are mostly **heavier pattern validators** (hinge-on-lower, etc.), surfacing the same coach copy on **saved workout / day screens** (Plan Preview now shows warm-up, reasoning, cool-down, and per-exercise notes when present — see [TRAINER_QUALITY_AND_ADVICE_PLAN.md](./TRAINER_QUALITY_AND_ADVICE_PLAN.md) Phase E), and metrics (see phases).

---

## Data flow (what Preview actually runs)

1. **Generate Plan** → `buildPlanInputs(...)` in `frontend/src/lib/planInputs.ts` produces **`PlanInputs`** (single snapshot).
2. **Plan Preview** → `runPipelineSafe(planInputs, ...)` — **only `PlanInputs`**, not the full form object, drives stages 1–7.
3. **Stage 5** → `buildGenerateSessionsRequest` in `planPipeline.ts` builds **`GenerateSessionsRequest`** (`frontend/src/services/planService.ts` types align with `backend/src/plans/dto/generate-sessions.dto.ts`).
4. **Backend** → `PlansService.generateSessions` → Groq batch / hybrid / per-session paths; then **`session-enrichment`** (`enrichGeneratedSession`) for ordering, balance, and library metadata.

---

## Field-by-field: UI → `PlanInputs` → LLM / rules

Legend: **Struct** = shapes the week before the LLM (skeleton, templates, session specs). **LLM** = included in Groq prompts via `GenerateSessionsDto` / chunk helpers. **Enrich** = post-processing, not the main creative pass. **Missing** = collected in UI or present in route `inputs` but not in `PlanInputs` / not sent to `generate-sessions`.

| User-facing area | In `PlanInputs`? | Reaches LLM / generator? | Notes |
|------------------|------------------|---------------------------|--------|
| Goal (fat loss, strength, endurance, balanced / hybrid) | Yes (`goal`) | Yes — string goal on DTO; rep/set bands via `getSetRepGuidelines` | `balanced` is sent as **`hybrid`** on the wire. |
| Plan style / program type | Yes (`planStyleId`) | **Indirect** — affects **Stage 1** recommendation when auto / recommended path uses `planRecommendation` | Not re-sent as a free-text “style” line on `GenerateSessionsDto`; influence is mostly **split choice** and context before the LLM. |
| Training days | Yes (`selectedWeekdays`, ordered with **start date**) | **Struct** — which weekdays are sessions vs rest | Ordering uses `startDateISO` in `planInputs.ts`. |
| Plan length (weeks) | Yes (`weeksCount`) | **Struct** — multiple week skeletons; chunking on server (≤7 sessions per Groq batch per week) | See token plan doc. |
| Start date | Yes (`startDateISO`, `startWeekday`) | **Struct** — day ordering | Calendar affects **order** of selected weekdays, not a separate “date” line in the LLM prompt. |
| Session time (min–max) | Yes (`durationMin` / `durationMax`, overrides) | **Struct** — per-session `durationMin` / `durationMax`; batch prompt uses a **single ~mid duration** per day | Advanced caps → `durationOverrides`. |
| Location (gym / home) | Yes (`location`) | Yes — `location` on DTO; **home** uses a **fixed** list in `plans.service.ts` | **Gym** without checklist → **“general gym equipment”** in batch prompt; **gym + checklist** → joined library labels (see `equipmentTags`). |
| Workout detail level | Yes (`detailLevel`) | Yes — drives prompt verbosity, `max_tokens`, hybrid eligibility | Week 2+ may downgrade to simple on server when user picked detailed. |
| Avoid list | Yes (`injuriesAvoid`) | Yes — `avoidConstraints` on DTO and merged per session | Also used in enrichment. |
| Hard-day caps | Yes (`hardDayLimits`) | **Struct** — `isHardDay` on each session | Affects labeling, not a separate essay to the model. |
| Training split / custom split | Yes (`splitPreference`, `customSplit`, `useRecommended`) | **Struct** — session **titles** (Upper, Push, custom primary label, …) | Stage 3 uses **Stage 1 `effectiveSplitId`** for preset titles (fixes **`auto` vs skeleton** mismatch). |
| Cardio modality chips | Yes (`cardioModalities`) | Yes — `cardioModalities` on DTO; short hint in batch prompt | Biases finishers / cardio rows where applicable. |
| Progression style | Yes (`progressionStyle`) | **Indirect** — compact `mesoHint` (~200 chars) on DTO from style + `weeksCount`; not the full progression UI | Full deload/ramp/target fields from legacy `inputs` are not on the DTO. |
| Preferred exercises | In type, optional | **Not in `buildGenerateSessionsRequest`** | Not wired into preview generation request. |
| Activity level | In type, optional | **Not in request** | Form does not feed `buildPlanInputs` for this field today. |
| **Experience level** | Yes (`experienceLevel`) | Yes — `GenerateSessionsDto`; batch + per-session + hybrid difficulty / set-rep | Default **intermediate** when form unset. **Beginner:** Groq may return per-exercise `notes` (capped **120** chars each in `workout-generator.service.ts`); intermediate/advanced prompts say **omit notes**. |
| **Available equipment** (gym checklist) | Yes (`equipmentTags`) | Yes (gym) — `generation-equipment-tags.util.ts` → library labels → candidate filter + batch / polish equipment text | Home unchanged (fixed HOME list). |
| Per-day time caps, weekday/weekend split, formats, etc. | Largely **no** in `PlanInputs` | **No** | Still passed as legacy `inputs` to Plan Preview for UX / future apply flows; **not** in Stage 5 payload. |

---

## Why token usage stays “low” (design tradeoffs)

- **One narrow API contract** (`GenerateSessionsDto`) keeps prompts bounded and cache-friendly.
- **Exercise choice is ID-bound** to a **trimmed catalog** (~65 lines tabular in batch mode) rather than the full library every time.
- **Week structure is mostly deterministic** (your code picks split pattern and day types); the LLM fills **exercise rows** and coach copy inside those rails.

That split (structure locally, LLM for contents) is how you avoid paying for a huge free-form “write my whole mesocycle” prompt every tap — at the cost of **not** sending long natural-language summaries of every slider.

**How strong general-purpose LLMs “feel” smarter (without huge prompts)**

Top-tier workout answers usually combine: (1) **explicit week structure** (split, day roles, volume), (2) **constraints** (equipment, time, injuries), (3) **session templates** (compound → accessories → finisher), (4) **light coaching** (rest, intent). Your stack does **(1)** and **(3)** in code + batch Groq; **(2)** now includes gym **`equipmentTags`** → library filter when set, plus avoids; **(4)** includes a **rest** line in the batch prompt from `setRep`, plus **capped per-exercise `notes`** when experience is **Beginner**. Closing remaining gaps uses **post-generation checks** **without** sending long prose per request.

---

## “Pro trainer / strong LLM” bar — what “good” means here

Use this as the **definition of done** for generation quality (orthogonal to tokens until you measure p95 usage).

| Dimension | “Pro-like” expectation | Today (summary) |
|-----------|-------------------------|------------------|
| **Week logic** | Training days match split; repeated patterns (e.g. two Uppers) differ in exercise choice; no absurd muscle stacking day-to-day | Batch prompt asks for variety; enrichment reorders; **Stage 3 titles follow Stage 1**; **endurance** adds a **dedicated cardio day** on preset splits (Stage 2) |
| **Session logic** | Compounds first, volume fits duration, pulls vs pushes sane for that focus | Prompt + `exerciseTargetsForSession`; enrichment |
| **Constraints** | Equipment and injuries actually change exercise pool | Avoids + goal yes; **gym `equipmentTags` → library filter** (when set) |
| **Difficulty** | Beginner vs advanced volume and rep feel different | **`experienceLevel` on DTO** + hard-day overrides + `makeItEasier` |
| **Coach surface** | Rest guidance, optional one-line “why this lift” for beginners | **Beginner:** Groq may attach capped `notes` per exercise (API → preview data); **rest in product UI** / non-beginner coaching lines still thin — see [LLM_GENERATION_HONEST_ASSESSMENT.md](../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md) |

Phases **2**, **3**, **3b**, and **4** for preview generation are **shipped** as written in this doc; what is left for “coach-grade” polish is mostly **tier-2 pattern checks**, surfacing **notes** in the live workout UI, and richer **metrics**—the stack still follows the same token strategy (tabular IDs, weekly batch, chunking).

---

## “Professional gym scheduling” — current strengths and gaps

**Strengths**

- Batch **`generateFullProgram`** sees **all sessions in the chunk at once**, with explicit instructions to **vary** repeated focuses (for example two Push days) and put **compounds first**.
- **Session enrichment** (`backend/src/plans/session-enrichment.ts`) pushes toward sensible ordering and constraints after generation.
- **Hard-day** and **duration** metadata nudge volume and intensity.

**Remaining gaps vs a human coach or a single huge LLM prompt**

- **Meso / progression:** a short **`mesoHint`** is in the batch Groq request; legacy deload frequency, ramp, and progression target are not.
- **Surfacing** beginner `notes` in the **live workout UI** (they can exist on preview payloads) and **rest in the product UI** — see [LLM_GENERATION_HONEST_ASSESSMENT.md](../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md).
- **Custom split + endurance**: dedicated cardio days still follow **custom** cardio preference only (no forced cardio day when user chose custom with cardio off).
- **Phase 3b (shipped):** duplicate exercise ids (within session / across chunk) + **min exercise count** vs `exerciseTargetsForSession`; **one batch retry** with widened `priorWeekExerciseIds`, then **per-session fallback** for the chunk; hybrid path uses the same checks (validator fail → fall through to batch).

---

## Is this roadmap “solid” for coach-grade output + low tokens?

**Yes, if you treat quality as three layers** — (A) **correct structure and labels** in the pipeline, (B) **tight constraints** into the model in roughly **under 50 extra prompt tokens** where possible, (C) **deterministic validation** after the model with **optional** tiny retries only when checks fail. The original phases covered (A) and part of (B); the additions below tie explicitly to “LLMs that do this well” and to [LLM_GENERATION_HONEST_ASSESSMENT.md](../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md) without opening the floodgates on input size.

**What this plan deliberately does *not* rely on**

- Dumping the entire form as prose into Groq.
- Letting the model invent exercise names outside the library (you already avoid that with IDs — keep it).
- One giant multi-week completion (you already chunk — keep it).

**Caveat (so expectations stay honest)**

This file is a **roadmap**, not a guarantee. Coach-grade output still depends on **shipping** remaining items (tier-2 pattern validators if desired, **metrics**) and proving the **“Pro trainer / strong LLM” bar** with QA. Ceiling quality is also bounded by **exercise library tagging** and enrichment rules.

### Pre-implementation risks (given the repo *today*)

Read this block before cutting code — several items are easy to underestimate.

| Risk | Why it matters | Mitigation when building |
|------|----------------|---------------------------|
| **Equipment strings ≠ UI chips** | `getCandidatesForGenerator` → `search()` filters with `exercise.equipment` **exact** string matches (see `exercises.service.ts`). Frontend checklist uses different literals (e.g. `dumbbells` vs library `Dumbbell`). | Add a **single canonical map** (UI tags → library equipment labels); integration test that candidate count stays **≥ ~20** per focus after filter or batch generation bails. |
| **Strict filters → batch `null` → more Groq** | Batch `generateFullProgram` returns `null` if merged candidates are **fewer than 20**; server falls back to **per-session** calls — often **more** total tokens than one batch. | Tune limits / fallback order with metrics; optionally relax equipment filter before widening prompts. |
| **Hybrid / polish path** | `generateSessions` may use **rule + polish** for some chunks (`PLAN_GENERATION_FLOW_AND_ISSUES.md`). Validators and retries must run on the **final** session list for that chunk and must not assume every day went through `generateFullProgram`. | Gate retries on chunk **`path`** or on “exercises came from rules” flags; add tests for hybrid + validator. |
| **Phase 3b validators need data** | Pull-balance today uses **name regex** in `session-enrichment.ts` (`PULL_NAME`), not only `movementPatterns`. Heavier validators (e.g. “hinge on Lower”) need **reliable metadata** or they will false-fail / false-pass. | Prefer **library fields** (`movementPatterns`, `primaryMuscleGroup`) where populated; define validator **tiers** (strict only when metadata exists). |
| **Beginner `notes` = output tokens** | Extra fields per exercise increase **completion** size, not just prompt — can push batch completions toward **`max_tokens` / truncation**. | Tight character caps in prompt + schema; watch `finish_reason === length`** after change. |
| **`effectiveSplitId` only inside the pipeline** | Was: Stage 3 keyed off `splitPreference` (`auto` → wrong titles). **Done:** Stage 3 receives Stage 1 output. | Keep regression test when editing stages 1–3. |
| **DTO / client drift** | New fields must stay aligned: `GenerateSessionsDto`, `planService.ts` types, `buildGenerateSessionsRequest`, and any E2E tests. | One PR touches all layers; add a contract test or snapshot of the JSON body shape. |

Also keep **[PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md](./PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md)** open alongside this doc so chunking, hybrid, and token caps do not regress while you add constraints.

---

## Recommended plan (phases — status)

Legend: **[x] done** · **[~] partial** · **[ ] not started**

These align with [PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md](./PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md) but emphasize **scheduling + coaching quality** and **UI honesty**.

### Phase 1 — Truth in the product (no token spike required)

- [x] **In-app “What drove this preview”** on Plan Preview: collapsible lines from **`PlanInputs`** via `frontend/src/lib/planGenerationSummary.ts` (aligned with `buildGenerateSessionsRequest` / DTO).
- [x] **Extra UI copy** listing legacy-only options (formats, weekday caps, etc.) as “not sent to AI” — `linesLegacyFormNotInAiRequest` in `planGenerationSummary.ts` + Plan Preview collapsible.

### Phase 2 — Close the highest-signal gaps with compact DTO fields (few tokens, large lift)

- [x] **`equipmentTags`** on `PlanInputs` + **`GenerateSessionsDto`** → `backend/src/plans/generation-equipment-tags.util.ts` → candidate filter + batch / polish equipment text.
- [x] **`experienceLevel`** on DTO + batch / per-session / hybrid difficulty + set/rep.
- [x] **Rest line** in batch user prompt from `setRep.restSeconds` (`generateFullProgram`).
- [x] **Per-exercise `notes`** for beginners only — prompts + `normalizeExerciseNoteForOutput` (**120** char cap); preview summary line when experience is Beginner.

### Phase 3 — Scheduling logic without bloating the LLM

- [x] **Stage 3 titles** from **Stage 1 `effectiveSplitId`** (`planPipeline.ts`).
- [x] **Meso hint** (~200 chars) from `progressionStyle` + `weeksCount`: `mesoHintForGenerateSessions` → `GenerateSessionsDto.mesoHint` → batch user prompt (`Program intent: …`).
- [x] **Endurance skeleton:** preset (non-custom) **`endurance`** goals get a **dedicated cardio day** in Stage 2 (same slot machinery as custom “cardio day” preference).

### Phase 3b — Week validators + scoped retry (0 tokens on happy path)

- [x] After Groq: **duplicate `exerciseId`** (same session + across chunk) and **below-min exercise count** vs prompts; **one scoped batch retry** (`buildRetryPriorExerciseIds`) then per-session chunk fallback; hybrid chunk must pass the same validators or fall through (`generated-chunk-validators.ts`).

### Phase 4 — Measurement (ties quality to tokens)

- [x] **Structured logs:** `groq_completion` JSON (label, `finish_reason`, token counts) alongside existing bracket lines in `WorkoutGeneratorService`; **`generate_sessions_chunk`** JSON may include **`groq`** (rolled-up usage for that chunk — **batch + per-session** when the chunk falls back to `generateWorkout` with a `groqUsageSink`) and **`validatorFirstPass` / `validatorRetry` / `validatorIssues`**; **`generate_sessions_summary`** JSON per `POST /plans/generate-sessions` sums those chunk totals (`PlansService`). *Hybrid polish* (`polishSimpleBatchSessionCopy`) still logs **`groq_completion`** but is **not** folded into **`generate_sessions_chunk.groq`** / the request summary (typically one small call per hybrid chunk).

---

## Code anchors (for implementers)

| Concern | Primary files |
|---------|-----------------|
| Form → `PlanInputs` | `frontend/src/lib/planInputs.ts`, `frontend/src/screens/GeneratePlanScreen.tsx` (`buildPlanInputs` call) |
| Stages 1–4 | `frontend/src/lib/planPipeline.ts` |
| Request payload | `buildGenerateSessionsRequest` in `planPipeline.ts` (includes `mesoHint`); DTO `backend/src/plans/dto/generate-sessions.dto.ts` |
| Preview “what we used” + legacy-not-sent copy | `frontend/src/lib/planGenerationSummary.ts`, `PlanPreviewScreen.tsx` |
| Groq batch + per-session prompts, beginner notes cap | `backend/src/workouts/workout-generator.service.ts` (`generateFullProgram`, `generateWithGroq`, `normalizeExerciseNoteForOutput`) |
| Orchestration + enrichment | `backend/src/plans/plans.service.ts`, `backend/src/plans/session-enrichment.ts` |
| Chunk validators + batch retry / fallback | `backend/src/plans/generated-chunk-validators.ts` (`validateGeneratedProgramChunk`, `buildRetryPriorExerciseIds`) |
| Observability (Groq + chunk + request summary) | `backend/src/workouts/workout-generator.service.ts` (`logGroqCompletionMeta`, `tryGenerateFullProgram` → `groqUsages`, `generateWorkout` optional **`groqUsageSink`**, `generateWithGroq` → `GenerateWithGroqOutcome`), `backend/src/plans/plans.service.ts` (`logGenerateSessionsChunkEvent`, `logGenerateSessionsRequestSummary`, `foldGroqUsages`) |

---

## Revision history

| Date | Notes |
|------|--------|
| 2026-04-17 | Initial coverage + pro-trainer bar + phased roadmap + execution caveat + pre-implementation risks (equipment/candidate/hybrid/validators/DTO) |
| 2026-04-17 | **Shipped (partial):** Stage 3 titles from Stage 1 `effectiveSplitId`; `PlanInputs` + DTO **`experienceLevel`** + **`equipmentTags`** (gym → library map → candidate filter + batch prompt); batch user prompt **rest** hint from `setRep`; hybrid + per-session use experience for non-hard days; polish **equipmentNote** uses gym checklist when set. |
| 2026-04-17 | **Shipped:** Phase 1 collapsible **“What drove this preview”** (`planGenerationSummary.ts` + `PlanPreviewScreen`); Phase 3 **endurance** = dedicated cardio day on **preset** splits (Stage 2); doc phase checklist updated. |
| 2026-04-17 | **Shipped:** **Meso hint** (`mesoHint` DTO + `generateFullProgram` “Program intent” block); preview summary shows same line. |
| 2026-04-17 | **Shipped:** Phase 1 follow-up — **“Also on Generate Plan (not in the AI request)”** bullets (`linesLegacyFormNotInAiRequest`); doc field table + gaps aligned with `mesoHint`. |
| 2026-04-17 | **Shipped:** Phase 2 **beginner-only per-exercise notes** (batch + per-session prompts; strip + **120** char cap); Plan Preview summary line for Beginner. |
| 2026-04-17 | **Shipped:** Phase **3b** — post-Groq **chunk validators** (duplicate ids + min exercises), **one batch retry** with tail `priorWeekExerciseIds`, **per-session fallback**; hybrid gated the same way. |
| 2026-04-17 | **Shipped:** Phase **4** — JSON **`groq_completion`**; chunk **`groq`** + validator hints; **`generate_sessions_summary`**; **`generateWorkout(..., groqUsageSink)`** + **`GenerateWithGroqOutcome`** so per-session fallback usage rolls into chunk / request totals (not batch-only). |
| 2026-04-17 | **Docs:** [TRAINER_QUALITY_AND_ADVICE_PLAN.md](./TRAINER_QUALITY_AND_ADVICE_PLAN.md) — phased plan (A–F) for smarter / more realistic trainer-style output without abandoning token discipline. |
