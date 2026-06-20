# Replace-exercise quality — match the muscle & avoid near-duplicates

**Date:** 2026-06-19
**Branch context:** `feat/beta-feedback`
**Status:** **Implemented 2026-06-19.** Backend `ExercisesService.pickReplacement` + `POST /exercises/replace` (catalog-based: same primary muscle, movement-pattern dedup vs the rest of the day, equipment/injury filters, quality-sorted pick). Frontend `handleReplaceExercise` repointed to it and now keeps the slot's prescription (sets/reps/rest), swapping only the exercise identity. **Pending on-device verification** (sit-ups → a core move; no flat-DB-bench when flat-BB-bench is present).
**Related:** the single-exercise swap fix in `PlanPreviewScreen.tsx` (`handleReplaceExercise`) fixed the *"reload changes the whole day"* bug. This doc covers the remaining **quality of the chosen replacement**.

---

## Symptom (real example)
On an **upper day**, tapping 🔄 on **sit-ups** replaced it with **flat dumbbell bench press** — even though **flat barbell bench press** was already the first exercise that day. Two things are wrong at once:
1. **Near-duplicate:** flat DB bench press is the *same movement* (horizontal press / chest) as the flat BB bench press already in the day.
2. **Wrong muscle/role:** sit-ups is a **core** exercise; it should have been replaced by another core/ab movement, not a chest press.

## Why it happens (current behavior)
`handleReplaceExercise` (`frontend/src/screens/PlanPreviewScreen.tsx`, ~L800):
1. Calls `generateSingleSession` to generate a **whole session for the DAY'S focus** (upper), excluding the **exact names** already in the day.
2. Picks a candidate: prefers one whose `primaryMuscleGroup` equals the replaced exercise's; otherwise falls back to `candidates[0]`.

Two gaps:
- **Dedup is exact-name only.** `"flat barbell bench press" !== "flat dumbbell bench press"`, so the near-duplicate passes. No movement-pattern / exercise-family awareness.
- **Candidate pool is the DAY'S focus, and the fallback is unrelated.** For sit-ups (core) on an upper day, the generated upper-day candidates contain **no core exercise**, so the same-muscle match fails and it falls back to `candidates[0]` — a chest press. The replacement is keyed to the *day*, not to the *exercise being replaced*.

## Root cause
The replacement is generated **for the day**, not **for the exercise being replaced**, and duplicate-avoidance is by **name** rather than **movement pattern / muscle**. The frontend `ExerciseDraft` only carries `primaryMuscleGroup` / `secondaryMuscleGroups` — it has **no movement-pattern field** — so the client *can't* detect near-duplicates on its own. That metadata lives in the backend catalog.

## Recommended fix (backend, catalog-based — deterministic, no LLM)
Add a purpose-built single-exercise replacement that runs against the exercise catalog, e.g. `POST /plans/replace-exercise` (or `/workouts/replace-exercise`):

**Input:** `{ targetExerciseName/Id, dayExercises: [names/ids already in the day], equipment (gym/home), avoidConstraints, goal, difficulty }`.

**Logic:**
1. Resolve the **target's** primary muscle group + movement pattern from the catalog.
2. Candidate pool = catalog exercises sharing the target's **primary muscle** (and/or movement pattern / role).
3. **Exclude** any candidate whose **movement pattern matches** an exercise already in the day → this kills the flat-BB-vs-flat-DB-bench dup. Also exclude exact name/id matches and the target itself.
4. Filter by equipment + injury-avoid constraints.
5. Optionally match the target's **role** (compound vs accessory) so a main lift is swapped for another main lift, not an isolation move.
6. Return one (random among top fits, or ranked).

**Frontend:** point `handleReplaceExercise` at this endpoint, passing the day's current exercises; keep the existing single-slot swap mechanics (those already work).

Reuse existing helpers: `backend/src/data/exercise-mappings.ts`, `backend/src/data/movement-pattern-fillins.ts`, `backend/src/plans/cross-session-diversity.ts` (already does movement-pattern variety logic), `backend/src/plans/session-enrichment.ts`.

## Stopgap (frontend-only, optional, lower quality)
If a quick partial mitigation is wanted before the backend work:
- Pass the **target's muscle group** to bias `generateSingleSession` toward the target's muscle (so sit-ups → core, not chest).
- Add a **name-token near-duplicate filter**: drop a candidate that shares a core movement token (`bench press`, `row`, `squat`, `deadlift`, `curl`, `press`) with an existing exercise. Heuristic + imperfect, but catches the obvious "bench press" twin.

## Acceptance criteria
- Replacing **sit-ups** on an upper day yields another **core** exercise (or a sensible same-role alternative) — never a chest press.
- The replacement is **never the same movement** as something already in the day (no flat-DB-bench when flat-BB-bench is present).
- Still respects equipment + injuries; never duplicates by name; only the tapped slot changes.

## Pointers
- Frontend: `frontend/src/screens/PlanPreviewScreen.tsx` (`handleReplaceExercise`, ~L800); `frontend/src/services/planService.ts` (`generateSingleSession`, L286); `frontend/src/types/plan.ts` (`ExerciseDraft` — **no movementPattern field**).
- Backend: `backend/src/plans/plans.service.ts` (`generateSingleSession`, L2012); `backend/src/data/exercise-mappings.ts`, `movement-pattern-fillins.ts`; `backend/src/plans/cross-session-diversity.ts`, `session-enrichment.ts`.

**Last reviewed:** 2026-06-19
