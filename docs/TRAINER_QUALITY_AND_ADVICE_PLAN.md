# Trainer-quality plan: smarter, more realistic advice (without abandoning token discipline)

**Last reviewed:** 2026-04-17  
**Audience:** Product and engineering — a **phased roadmap** to push Generate Plan / preview output toward **“extremely smart, realistic trainer”** behavior while staying aligned with the current stack: **structure in code**, **Groq fills the week inside rails**, **bounded prompts**, **validators + enrichment** after the model.

**Related:** [GENERATE_PLAN_UI_TO_AI_COVERAGE.md](./GENERATE_PLAN_UI_TO_AI_COVERAGE.md) (what is wired today), [PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md](./PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md), [../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md](../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md), [../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md](../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md).

---

## Guiding principle

**Realism and “trainer brain”** should come mainly from:

1. **Explicit rails** the model cannot ignore (short, factual constraints per session type).
2. **Library truth** (`movementPatterns`, primary muscle, equipment) — garbage in → garbage out.
3. **Short, non-generic copy rules** for `programSummary`, `reasoning`, `warmUp`, `coolDown` (and beginner `notes` where enabled).
4. **Deterministic post-processing** (enrichment + validators) — fix or retry without paying for long prose up front.

Avoid relying on **one huge motivational prompt**; that tends to burn tokens and still not guarantee structure.

---

## Phase A — Deterministic “session rails” (highest ROI / low tokens)

**Goal:** Give the model **1–2 lines of code-generated context per day** derived only from session spec + goal + experience + detail level — **no extra LLM call**.

**Examples (keep each rail short; tune in implementation):**

- **Upper:** At least one horizontal push, one vertical push, and one row or vertical pull; accessories fill gaps.
- **Lower:** Include a knee-dominant pattern and a hip hinge; single-leg work optional.
- **Pull:** Prioritize a vertical pull and a row before arm isolation.
- **Push:** One main horizontal push and one vertical push before smaller isolation work.
- **Beginner:** Fewer total exercises; technique and consistency over grinding; use `notes` only where the contract allows.
- **Fat loss / hybrid-style goals:** Keep density reasonable; finisher last when the pipeline prescribes it.

**Where to implement (when coding):**

- New small module, e.g. `backend/src/plans/session-coaching-rails.ts` (or colocated with `session-enrichment.ts`).
- `WorkoutGeneratorService.generateFullProgram`: inject rails into **`dayLines`** or the tail of **`userPrompt`**.
- `generateWithGroq`: append the same rail for that session’s **`userPrompt`**.

**Token impact:** A few dozen **prompt** tokens per training day; **zero** extra completion tokens.

**Risks:** Low if rails stay short and do not contradict `exerciseTargetsForSession` / conditioning rules.

---

## Phase B — Prompt “anti-slop” rules for copy fields (medium ROI / low–medium tokens)

**Goal:** `programSummary`, per-day **`reasoning`**, **`warmUp`**, **`coolDown`** read like a real coach, not generic filler.

**Instruction themes (batch + per-session):**

- Reference **concrete structure** (main work → accessories → finisher if any), not vague motivation.
- Extend **tone rules** already used for workout **names** to **reasoning** (no hype, beast-mode, etc.).
- **Warm-up / cool-down:** Align with post-processing intent (e.g. `tieWarmupToMainLift` in `session-enrichment.ts`) — prompt should say prep for the **first heavy pattern** of the day.
- **Experience:** One compact line — e.g. intermediates: working sets around **RPE 7–8** on compounds unless easier is requested; beginners: quality reps over maxing out.

**Where:** `backend/src/workouts/workout-generator.service.ts` — `systemPrompt` / `structureBlock` / trailing **`userPrompt`** for `generateFullProgram` and `generateWithGroq`.

**Token impact:** Slightly larger system/user strings; validate **`finish_reason === length`** on worst-case weeks (many days, detailed).

---

## Phase C — Enrichment + validators using library metadata (high realism / 0 LLM on success)

**Already in place:** compound ordering using `movementPatterns`, pull-balance heuristics, warm-up tie-in, chunk validators (duplicate ids, min exercises), optional batch retry.

**Extensions (when coding):**

1. **Movement coverage (tiered):** When library metadata is present, e.g. **Lower** → require **Squat** + **Hinge** in `movementPatterns`; relax or skip when metadata is missing to avoid false fails.
2. **Push / pull days:** Light checks (e.g. avoid “all isolation before any compound”) using ordering + patterns.
3. **Optional deterministic line:** Append a short **server-generated** coaching line to `reasoning` or a dedicated field if the API/UI needs separation — still **no** extra Groq call.

**Where:** `backend/src/plans/session-enrichment.ts`, optionally `backend/src/plans/generated-chunk-validators.ts` (failed check → existing scoped retry path).

**Shipped (2026-04-17):** Phase C logic lives in `enrichGeneratedSession`: **tiered sort** (main `Squat`/`Hinge`/`Push`/`Pull` patterns before accessories when library metadata distinguishes them), **lower-day squat + hinge** inserts from the lower candidate pool when ≥2 exercises already have non-empty `movementPatterns` but the union lacks `Squat` or `Hinge`, **pull-balance** path now appends a short **Note:** sentence to `reasoning` when a pull is auto-added. **Upper-emphasis sessions** (title/heuristic) additionally **demote hinge/squat-pattern names** and **isolation-first** ordering so compounds and sane **warm-up anchors** win over e.g. flyes or sumo deadlifts on “Upper”. Phase A rails (`session-coaching-rails.ts`) append a **no primary lower work** line on push/pull/upper/chest/back/shoulders/arms; batch `systemPrompt` scopes the squat/leg-press example to Lower/Legs only. `validateGeneratedProgramChunk` (batch + hybrid paths) now optionally receives a **movement map** from the in-memory catalog: on **upper-emphasis** strength titles, any exercise whose metadata includes **Squat** or **Hinge** triggers **`primary_lower_pattern_on_upper_focus`**, appends those ids to the **batch retry tail** (same mechanism as duplicate ids), and still runs on **pre-enrichment** output. A future improvement is re-running or merging checks **after** `enrichGeneratedSession` when enrichment inserts patterns.

**Token impact:** **Zero** additional Groq on happy path; retries only when checks fail (same tradeoff as today).

---

## Phase D — Data / catalog investment (highest ceiling; not “prompt only”)

- Audit **`movementPatterns`** and **`primaryMuscleGroup`** for exercises that appear in generator candidate pools.
- Fix **mis-tagged** or **ambiguous** names; they flow straight into weak or incoherent weeks.
- Longer-term: optional **`coachingCue`** (one line) on high-traffic exercises — can be merged into preview rows **server-side** for beginners without bloating the LLM JSON schema.

**Shipped (2026-04-17):** `MOVEMENT_PATTERN_FILLINS` + merge in `transformExercise` (`exercise-mappings.ts`) so **262 previously unknown `movementPatternIds`** resolve to canonical `Push|Pull|Squat|Hinge|Lunge|Carry` (~265 exercises that used to lose all patterns now retain metadata). Regenerate from TSV via `npm run generate:movement-fillins` (see `scripts/build-movement-fillins.cjs`, `scripts/unmapped-movement-pattern-ids.tsv`). **`npm run audit:catalog`** prints how many rows would have been empty without fill-ins. Jest: `movement-pattern-fillins.spec.ts`. **`coachingCue` on exercises** and primary-muscle audits remain future work.

---

## Phase E — Product surfacing (perceived “trainer” quality)

- Plan Preview: surface **`reasoning`**, **`warmUp`**, **`coolDown`**, and beginner **`notes`** clearly so users **see** the advice.
- Short copy: how preview maps to AI vs legacy-only controls (cross-link [GENERATE_PLAN_UI_TO_AI_COVERAGE.md](./GENERATE_PLAN_UI_TO_AI_COVERAGE.md)).

**Shipped (2026-04-17):** Plan Preview shows a **surface hint** under the week summary (Generate Plan path), **“Session advice”** heading + existing warm-up / why / cool-down blocks in the session modal, **per-exercise notes** under sets×reps when present, a one-line **Exercises** subcaption when any note exists, and week cards append **`· Coach advice`** when `sessionHasCoachPreviewFields` (warm-up, reasoning, cool-down, or any exercise note). `buildWorkoutPreviewFromSessionDraft` now forwards **`notes`** from `SessionDraft`. See [GENERATE_PLAN_UI_TO_AI_COVERAGE.md](./GENERATE_PLAN_UI_TO_AI_COVERAGE.md) for the full request vs form-only matrix.

---

## Phase F — Optional second Groq pass (expensive; use sparingly)

- After a **successful** batch, a **small** polish pass on **copy fields only** (similar in spirit to hybrid `polishSimpleBatchSessionCopy`) for **`detailed`** users — or only when heuristics detect weak copy (too short, banned terms).
- **Cost:** Real increase in tokens; gate behind feature flag, `detailLevel`, and/or week index.

---

## Recommended implementation order

| Order | Phase | Rationale |
|-------|--------|-----------|
| 1 | **A** + **B** | Best **quality per token**; rails + copy rules are quick wins. |
| 2 | **C** | Fewer “valid but dumb” weeks once metadata supports it. |
| 3 | **D** | Parallel with QA; raises the ceiling for C and enrichment. |
| 4 | **E** | Improves **perceived** quality without more Groq. |
| 5 | **F** | Only if metrics show **copy** is the bottleneck. |

---

## Honest ceiling

Even with Phases A–F, output remains bounded by **LLM variability** and **catalog quality**. This plan moves output toward **consistent, sober, realistic coach voice + structure**; it does not guarantee **“best human coach on earth every run”** — that still requires **QA rubrics**, **metrics** (see Phase 4 in coverage doc), and **iterative tuning**.

---

## Revision history

| Date | Notes |
|------|--------|
| 2026-04-17 | Initial plan: Phases A–F, guiding principle, implementation order, honest ceiling. |
| 2026-04-17 | **Phases A + B shipped:** `session-coaching-rails.ts` (per-day rails in batch `dayLines`, rail in `generateWithGroq` user prompt) + `coachCopyToneBlock()` appended to batch and per-session system prompts. |
| 2026-04-17 | **Phase C shipped:** `session-enrichment.ts` — tiered compound ordering, lower-day squat/hinge library fills when metadata supports checks, deterministic `reasoning` notes when pull or lower patterns are auto-added. |
| 2026-04-17 | **Phase D (first slice) shipped:** `movement-pattern-fillins.ts` + `transformExercise` merge; `scan-unmapped-movement-patterns.ts`, `build-movement-fillins.cjs`, `audit-exercise-catalog.ts`, `npm run audit:catalog` / `generate:movement-fillins`. |
| 2026-04-17 | **Phase E shipped:** Plan Preview coach surfacing (`PlanPreviewScreen`), `sessionHasCoachPreviewFields` + card `detailLine` suffix, `buildWorkoutPreviewFromSessionDraft` exercise `notes`. |
