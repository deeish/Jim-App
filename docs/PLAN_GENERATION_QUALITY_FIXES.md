# Plan Generation — Workout Quality Fixes (pre-launch)

**Created:** 2026-06-02
**Owner:** Dylan
**Status:** Planning — this is the **last quality gate before buying the Apple Developer account** and shipping to TestFlight.
**Source of evidence:** local generation capture `backend/logs/generation-captures/generation-1780442571106-6181c27c.json` (a real 3-week, 12-session plan generated 2026-06-02). Goal `hybrid`, experience `advanced`, detail `detailed`, location `gym`, Upper/Lower 4-day split.

---

## Guiding constraint — we are on the FREE Groq tier

Every fix below is deliberately **deterministic, server-side post-processing** (validators, repair passes, rounding/caps stamped after the model returns). **None of them add a Groq call or enlarge a prompt.** Today a 3-week plan costs **2 Groq calls total** (week 1 is generated, weeks 2–3 are cloned with progression math — confirmed in the capture: `meta.groq.groqCalls = 2`). We keep that. Prompt tweaks are listed only as optional "nudges," never as the primary fix, because on the free tier we cannot rely on the model and cannot afford retries.

**Principle:** the LLM proposes; deterministic code disposes. Quality must be guaranteed by code, not by hoping the 70B model behaves.

---

## Summary

| # | Issue | Severity | Root cause (file) | Recommended fix | Effort |
|---|-------|----------|-------------------|-----------------|--------|
| 1 | Per-session volume too high (24→30→33 sets) | High | No total-set cap; `set-rep-schemes.ts` + `exerciseTargetsForSession` (`workout-generator.service.ts:53`) | Deterministic **per-session + per-muscle set budget** post-pass | M |
| 2 | Progression over-inflates volume (+25% not +8%) | High | `Math.ceil` in `tryCloneAndProgress` (`plans.service.ts:613`) | `ceil`→`round`; distribute the delta instead of +1/exercise; soften multipliers | S |
| 3 | Split integrity broken (chest/flyes on "Lower" days) | High | `runUpperPatternPass` is upper-only; **no lower pass** (`generation-chunk-repair.ts:450`) | Add `runLowerPatternPass` (mirror image) | M |
| 4 | Redundant selection (3–4 hinge variants in one session) | Medium | No per-session **movement-pattern cap** (dedup only matches identical ids) | Per-session pattern-count cap in the repair pass | M |
| 5 | Cardio finisher prescribed as "5×11 sets" | Medium | LLM-placed cardio rows keep strength sets/reps; only the *appended* finisher is normalized (`session-enrichment.ts`) | Normalize **all** `type:"time"`/cardio rows to a single timed bout | S |

Severity = impact on a knowledgeable user's trust at first open. 1–3 are the ones a real lifter notices immediately.

---

## Issue 1 — Per-session volume is too high

**Symptom (from capture):** every working exercise gets a flat set count — 4 (wk1), 5 (wk2), 5 (wk3) — across 6 exercises, giving **24 / 30 / 30–33 working sets per session**. Week-3 Tuesday "Lower-A" had **7 leg exercises (~30+ leg sets in one session)** — far past the point of diminishing returns and brutally fatiguing.

**Root cause:** sets and exercise count are decided independently with **no ceiling on their product**:
- `backend/src/data/set-rep-schemes.ts` — `hybrid/advanced` = `setsMin 4, setsMax 5` (per exercise). Sets are assigned *per exercise* with no awareness of how many exercises the session has.
- `exerciseTargetsForSession` (`backend/src/workouts/workout-generator.service.ts:53-70`) — for `detailed` + duration > 55 min returns `minExercises: 7, promptRange "7-10"`. So the model is *asked* for 7–10 exercises, each gets 4–5 sets → 28–50 sets. Nothing reconciles the two.

**Options considered:**
- **(A) Lower the set scheme** (e.g., hybrid/advanced → 3–4). Simple, but blunt: it also lowers low-exercise-count sessions that were fine, and doesn't stop a 7-exercise day.
- **(B) Lower `exerciseTargetsForSession` high tier** (7-10 → 5-7). Helps, but the real problem is total volume, not count alone.
- **(C, recommended) Add a deterministic per-session volume-budget post-pass** that caps total working sets and per-muscle sets, trimming the *last* set from accessory/isolation movements first (never from the primary compound). Runs after generation + repair, before enrichment, in `plans.service.ts` (or a new `session-volume-budget.ts`).

**Recommended fix (C):**
- Define an experience-scaled budget, e.g. **strength working sets per session**: beginner ≤ 14, intermediate ≤ 18, advanced ≤ 22; **per primary muscle group per session ≤ ~12**. (Tune; these are evidence-aligned upper bounds, not targets.)
- Algorithm: compute total working sets (exclude cardio/`time` rows). While over budget, remove one set from the exercise with the most sets that is **not** the session's anchor/compound (use `movementPatterns` / `primaryMuscleGroup` + order index), floor at 2 sets. Then enforce the per-muscle cap the same way.
- Combine with a light **(B)**: drop the top tier of `exerciseTargetsForSession` from `7-10`/min 7 to about `6-8`/min 6 for `detailed`. Fewer junk slots up front means the budget pass rarely has to trim hard.

**Why this is free-Groq-safe:** pure arithmetic on the returned JSON. No model involvement.

**Effort:** Medium. **Risk:** Low (only ever removes sets; never calls out for replacements).

---

## Issue 2 — Progression over-inflates volume

**Symptom:** week 1 = 4 sets/exercise, week 2 = **5**, week 3 = **5**. The intended week-2 bump is only **+8%**, but every exercise jumped a full set (+25%), so a 24-set session became 30.

**Root cause:** `PlansService.tryCloneAndProgress` (`backend/src/plans/plans.service.ts:608-617`):
```ts
sets: Math.max(1,
  prog.volumeMultiplier >= 1
    ? Math.ceil(ex.sets * prog.volumeMultiplier)   // ← ceil(4 × 1.08) = ceil(4.32) = 5
    : Math.floor(ex.sets * prog.volumeMultiplier)),
reps: Math.max(1, Math.min(100, ex.reps + prog.repModifier)),
```
`Math.ceil` rounds **any** positive fraction up to the next whole set, applied to **every** exercise, so a 1.08 multiplier across 6 exercises adds 6 sets, not ~2. Compounding the problem, the same week stacks **three** stressors at once — more sets, **fewer reps** (`repModifier` −1/−2), and **higher intensity** (`intensityPct` 65→69→73). Multipliers come from `frontend/src/lib/planGenerationSummary.ts:28-56` (`build`: 1.0/1.08/1.16; `build_deload`: 1.0/1.15/1.25/0.70).

**Options considered:**
- **(A) `ceil`→`round`.** One-character-ish change. `round(4×1.08)=4`, `round(4×1.16)=5`. Removes the artifact immediately. Minimal risk.
- **(B) Distribute the delta at the session level.** Compute target total sets = `round(week1Total × multiplier)`, then add/remove sets on the **top 1–2 compounds only**, not uniformly. More faithful to "+8% volume," keeps accessories stable.
- **(C) Soften the multipliers** in `weekProgressionForGenerateSessions` (cap volume at ~1.15; don't raise volume *and* drop reps *and* raise intensity to their maxes in the same week).

**Recommended fix:** **A + B + C together** — they're cheap and complementary. A stops the rounding blow-up now; B makes progression realistic; C prevents the `build_deload` "peak" week (1.25 vol, −2 reps, 75%) from being a triple-whammy. After Issue 1's budget pass also runs on cloned weeks, totals stay bounded regardless.

**Free-Groq-safe:** yes — cloned weeks never call Groq; this is all arithmetic.

**Effort:** Small. **Risk:** Low.

---

## Issue 3 — Split integrity broken (upper movements on "Lower" days)

**Symptom (from capture):** Friday "Lower-B" contained **Flat Barbell Bench Press**; week-1 "Lower-B" had a **Dumbbell Fly**. Chest pressing on a lower-body day is an obvious programming error.

**Root cause:** the deterministic split-repair is **one-directional**. `runUpperPatternPass` (`backend/src/plans/generation-chunk-repair.ts:450-495`) only fires on **upper-emphasis** strength titles and only removes **squat/hinge** movements:
```ts
if (spec.type !== 'strength' || !sessionTitleIsUpperEmphasis(spec.title)) continue;
...
if (!patternsIncludeSquatHinge(meta?.movementPatterns)) continue;  // swap squat/hinge OFF upper days
```
There is **no `runLowerPatternPass`** — nothing strips chest/shoulder/horizontal-press movements **off lower days**. So the model's cross-assignment survives to the user.

**Recommended fix:** add a mirror-image **`runLowerPatternPass`**, wired into `repairChunkGeneratedSessions` right after the upper pass (`generation-chunk-repair.ts:540`):
- Fire on `spec.type === 'strength' && sessionTitleIsLowerEmphasis(spec.title)` (add the helper mirroring `sessionTitleIsUpperEmphasis`; "lower", "leg(s)", "lower-a/b", "posterior", "quad", "glute").
- For each row whose `movementPatterns`/`primaryMuscleGroup` is **upper-only** (Chest, Shoulders, Back, Arms / Horizontal Press, Vertical Press, Row, Pulldown), swap it via the existing `pickWithEquipmentTiers(...)` with predicate `(c) => isLowerBody(c)` — reusing the exact machinery the upper pass uses.
- **Must-skip:** the appended hybrid **cardio finisher** (a treadmill/bike row is *expected* on a lower day for hybrid goals). Skip rows with `prescriptionType === 'time'` or `primaryMuscleGroup === 'Cardio'`, so the finisher is never "repaired" away. (See Issue 5 — the finisher should be clearly tagged.)

**Free-Groq-safe:** yes — swaps come from the local exercise library, no Groq.

**Effort:** Medium (mostly mirroring an existing, tested pass). **Risk:** Low–Medium — verify it can always find a lower-body replacement (fall back to leaving the row rather than emptying the slot).

---

## Issue 4 — Redundant exercise selection within a session

**Symptom (from capture):** week-3 Tuesday paired **RDL + Single-Leg RDL + Stiff-Leg Deadlift** (three near-identical hinges); week-1 Friday paired **Sumo + Conventional Deadlift**. Movement variety within a session is poor.

**Root cause:** the existing dedup (`runDuplicatePass`) only catches **identical library ids** across sessions. Three *different* hinge ids are not duplicates, so nothing flags them. There is **no per-session cap on how many lifts share a movement pattern**.

**Recommended fix:** add a **per-session movement-pattern cap** to the repair pass (same file/family as Issues 3): e.g., **max 2 lifts per primary `movementPattern` per session** (Hinge, Squat, Horizontal Press, Vertical Press, Row, Pulldown, Lunge). On the 3rd+ of a pattern, swap to the session's **under-represented** pattern via `pickWithEquipmentTiers`. Order matters: run **after** the upper/lower purity passes (so we don't add an upper movement to satisfy variety on a lower day) and **before** the volume budget.

**Free-Groq-safe:** yes — library swaps only.

**Effort:** Medium. **Risk:** Low–Medium (ensure the swap pool isn't exhausted; fall back to keeping the row).

---

## Issue 5 — Cardio finisher prescribed as "sets × reps"

**Symptom (from capture):** "Treadmill Incline Walk: **4×12**", "Assault / Air Bike: **5×11**" — with `prescriptionType: "time"` but strength-style `sets`/`reps` still attached. A timed walk shouldn't read as 5 sets of 11.

**Root cause:** `session-enrichment.ts` carefully normalizes the **appended** hybrid cardio finisher to a time bout (`prescriptionType: 'time'`, `reps ≈ minutes`), but **cardio rows the model places in the session body** keep whatever `sets`/`reps` it invented. There's no single normalization that guarantees *every* cardio/time row has a sane shape.

**Recommended fix:** one deterministic normalization at the end of enrichment: for **any** row where `prescriptionType === 'time'` or `primaryMuscleGroup === 'Cardio'`, force **`sets = 1`** and convert the duration into the field the UI reads for time rows (e.g., a single bout of N minutes), and **exclude these rows from working-set counts** (ties into Issue 1's budget and Issue 3's skip rule). This makes the cardio shape correct everywhere, not just for the appended finisher.

**Free-Groq-safe:** yes — pure normalization.

**Effort:** Small. **Risk:** Low. **Bonus:** also verify the frontend display (`frontend/src/lib/exercisePrescription.ts`) renders a `time` row as "~N min", not "S × R".

---

## Recommended implementation order

Phased so each step is independently testable and low-risk. All server-side; no new Groq calls.

1. **Issue 2 (S)** — `ceil`→`round` + soften multipliers. *Immediate, removes the worst volume artifact on weeks 2+.*
2. **Issue 5 (S)** — normalize all cardio/time rows. *Unblocks accurate set-counting for the next steps.*
3. **Issue 3 (M)** — `runLowerPatternPass`. *Highest user-visible credibility win.*
4. **Issue 4 (M)** — per-session movement-pattern cap.
5. **Issue 1 (M)** — per-session + per-muscle volume budget (runs last, after purity + variety, so it trims a clean session).

Each step: `cd backend && npm run lint && npm test` (the `plans/eval/` harness + golden/invariant specs should stay green — extend them with a "no upper movement on lower day", "≤2 per pattern", and "session set budget" invariant).

---

## How to verify

1. Re-generate the same hybrid/advanced 4-day plan locally (capture is enabled in `backend/.env`).
2. Parse the newest capture and check:
   - **Per-session working sets** ≤ budget (e.g., ≤ 22 advanced) and **per-muscle ≤ ~12**.
   - **Weeks 2–3** show a realistic bump (≈ +1–2 total sets), not +1 per exercise.
   - **Zero** upper-only movements on lower-titled days (and vice-versa, already enforced).
   - **≤ 2** lifts per movement pattern per session.
   - Every cardio/`time` row has `sets: 1` and a minute-based duration.
   - `meta.groq.groqCalls` is still ~**2** for a 3-week plan (we did not add LLM cost).

---

## Out of scope (note for later, not blocking launch)

- Per-exercise **set differentiation by role** (compound 4 / accessory 3 / isolation 2) — nicer than a flat scheme; larger change to set assignment. The budget pass (Issue 1) approximates the benefit for now.
- Session **duration estimate vs prescribed volume** reconciliation (the preview's "~15 min" label vs a 20+ set session) — worth auditing `estimateWorkoutMinutes.ts` once volume is capped.
- Prompt-level nudges (telling the model the per-session set budget and split purity up front) — optional future polish; **not** relied on, because free-tier output isn't guaranteed.
