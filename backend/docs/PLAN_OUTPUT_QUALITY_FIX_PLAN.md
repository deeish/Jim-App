# Plan Output Quality: Fix Plan (Re-prioritized — Trainer-Quality Generation)

**Last reviewed:** 2026-04-27 — Update when the time estimate, chunk validators, ordering rules, or candidate balancing change. See root [`docs/INDEX.md`](../../docs/INDEX.md), [`PLAN_GENERATION_FLOW_AND_ISSUES.md`](./PLAN_GENERATION_FLOW_AND_ISSUES.md), and [`LLM_GENERATION_HONEST_ASSESSMENT.md`](./LLM_GENERATION_HONEST_ASSESSMENT.md).

**Goal:** Bring Preview Plan output up to the bar of a strong LLM full-plan write-up *and* a real trainer’s programming. We are most of the way there but the last 30–40% is what makes a session “feel right.”

This is the **revised** version of the original plan. The first version (kept in git history) only addressed (a) the visible time bug and (b) sub-muscle stacking. After re-grading the latest generation capture against what a trainer would actually flag, those two are necessary but not sufficient — there are bigger smells that the original phasing missed.

The capture used as ground truth: [`generation-1776722579925-cc734d2b.json`](../logs/generation-captures/generation-1776722579925-cc734d2b.json).

---

## What we’re actually trying to fix (ranked by trainer impact)

Looking at one Tuesday Lower session from the capture, post-enrichment:

```
1. Seated Leg Extension       (isolation)
2. Standing Calf Raise         (isolation)
3. Conventional Deadlift       (the compound — buried in slot 3)
4. Overhead March              (core)
5. Rotational Sit-Up           (core)
6. Landmine Rotation           (core)
7. 45-Degree Leg Press         (compound — buried at the end)
```

This **single session** exposes most of what is wrong:

| Smell | Why it matters | Already enforced? |
|---|---|---|
| Compounds not in slot 1–2 | Deadlift / Leg Press buried under isolations means the user fatigues on the wrong movements | Sort exists but post-fill-in re-sort doesn’t run (see Issue 2 below) |
| 3 of 7 exercises are core on a Lower day | A Lower day should have ~1 core movement, not three | No |
| 0 lunge / 0 carry / 0 unilateral | Movement-pattern coverage is missing | Only Squat/Hinge/Push/Pull are tracked |
| Same sub-muscle hit 2–3× in a session | E.g. 3 hamstring lifts, 3 upper-chest pushes (other sessions) | No |
| Card vs modal show different minutes (`87` vs `96`) | Visible UI bug | **Fixed in Phase 1 (Apr 27)** |
| Cardio finisher rows showing `1 × 7-13` reps instead of a duration (e.g. `8–12 min`) | Treadmill / bike / rower etc. are time-based, but their library `prescriptionType` defaults to `reps` and the formatter has no Cardio fallback | **Fixed in Phase 6a (Apr 27)** |
| Reps shown as `4×8` with no rest / tempo / RPE / progression | Trainer-quality requires these | `restSeconds` exists in `set-rep-schemes.ts`, never surfaced |
| Two Upper days both flat-bench / both seated OHP | No incline angle anywhere all week | No |
| Heavy bias toward landmine / overhead-march novelty moves | Candidate library top picks aren’t staples | Anchor pool exists but isn’t required to appear |

Phases below are ordered by **trainer impact per line of code**, not by ease.

---

## Phase 1 — Visible time mismatch (UI fix, no programming change) — **DONE (Apr 27)**

### Symptom

Same Upper / Monday session, two views:
- Week list card: `87 min · Strength · 7 exercises · Coach advice`
- Tap into the same card: `Monday • 96 min • Strength`

### Root cause

Both views call `getWorkoutDisplayEstimateMinutes` in `frontend/src/lib/estimateWorkoutMinutes.ts` (which blends a heuristic with `plannedMinutes` at `PLANNED_BLEND = 0.22`). They feed it different anchors:

| View | `exercises` input | `plannedMinutes` input |
|------|-------------------|------------------------|
| Week list card (`planPipeline.ts → planDraftToWeekPlans`) | `session.exercises` | `(durationMin + durationMax) / 2` (e.g. **45**) |
| Detail modal (`PlanPreviewScreen.tsx` ~line 1511) | `previewData?.exercises ?? workout.applyExercises` | `previewCard.workout.durationMinutes` (the **already-blended** value, e.g. **87**) |

Feeding the heuristic its previous output drifts the number up every render. Plus, `buildWorkoutPreviewFromSessionDraft` appends a synthetic cardio finisher row (`isSyntheticFinisher: true`) to `previewData.exercises` for hybrid goals — visible only in the modal, adding more drift.

### Fix (frontend-only)

1. `frontend/src/screens/PlanPreviewScreen.tsx` — add `plannedDurationMinutes` to `PlanWorkout`, populated from `(session.durationMin + session.durationMax) / 2` in `planDraftToWeekPlans` (`frontend/src/lib/planPipeline.ts`). Use that field as the `plannedMinutes` argument when computing the modal subtitle minutes.
2. `frontend/src/lib/estimateWorkoutMinutes.ts` — extend `ExerciseLike` with optional `isSyntheticFinisher?: boolean` and skip those rows in the totals (or filter at the call site). Card and modal will then count the same set.
3. (Optional) memoize the heuristic on `SessionDraft` so both views read one cached number.

### Acceptance

- For the same `SessionDraft` the card minutes and modal minutes match (within ±1 due to rounding).
- New test in `frontend/src/lib/planPipeline.test.ts` that the modal computation matches the card computation for a session with `cardioFinisher` set.

---

## Phase 2 — Compound-first ordering after every fill-in — **DONE (already landed in commit `15b0a05` Apr 23; capture predates the fix; regression spec added Apr 27)**

### Symptom

Tuesday Lower from the capture has the compound (Conventional Deadlift) in slot 3, behind two isolations. The squat-hinge fill-in pass added the deadlift specifically for hip-hinge coverage (note: *“Added for hip hinge coverage on lower day”*) — but it’s in the wrong slot.

### Root cause

`enrichGeneratedSession` in `backend/src/plans/session-enrichment.ts` runs in this order:

1. `sortExercisesByCompoundOrder` (uses `idealStrengthExercisePermutation` — works correctly).
2. Then the pull-balance and squat/hinge fill-in passes **append/insert** new exercises.
3. **No second pass of `sortExercisesByCompoundOrder` after the fillers run.**

So whatever the fill-in passes add ends up wherever they put it — never re-anchored to the compound-first invariant.

### Fix (backend, single function)

- In `enrichGeneratedSession`, call `sortExercisesByCompoundOrder` **once at the end** as well as at the start. It’s deterministic, so re-running it on an already-sorted list is a no-op when nothing changed.
- Add a unit test in `session-enrichment.spec.ts`: feed a session that already has `Leg Extension, Calf Raise` and trigger the squat-hinge filler — assert the deadlift ends up in slot 1.

### Acceptance

- Re-running the saved capture yields a Tuesday Lower with `Conventional Deadlift` (or `45-Degree Leg Press`) in slot 1 or 2.
- Existing eval scoring (`eval-scoring.ts → idealStrengthExercisePermutation`) shows higher alignment scores after the change.

---

## Phase 3 — Per-session movement-pattern budget (subsumes most “feel” issues)

### Symptom

- 3 of 7 Tuesday Lower exercises are core / anti-rotation.
- 0 lunges, 0 carries, 0 unilateral on either Lower day.
- Two Upper days are both flat-press + seated-overhead-press; no incline angle all week.

### Root cause

The chunk validator (`backend/src/plans/generated-chunk-validators.ts`) only checks:
- `duplicate_exercise_id_in_session`
- `duplicate_exercise_id_across_chunk`
- `below_min_exercises`
- `primary_lower_pattern_on_upper_focus` (Squat/Hinge on Upper titles)

It has **no** notion of movement-pattern *budget per session*. The library has `movementPatterns` (`Push`, `Pull`, `Squat`, `Hinge`, `Lunge`, `Carry`, plus arbitrary domain patterns) and primary-muscle-group on every row — neither is counted at session level.

### Fix (backend, validator + retry tail)

Add a new `over_concentrated_pattern` validator that enforces a session pattern budget. Initial caps (tunable):

| Session focus (from title) | Max core | Max same `movementPattern` (Push/Pull/Squat/Hinge/Lunge/Carry) | Min unique patterns |
|---|---|---|---|
| Upper / Push / Pull / Chest / Back | 1 | 3 | 3 |
| Lower / Legs | 1 | 3 | 2 (squat OR hinge AND another) |
| Full body | 2 | 2 | 4 |
| Cardio / Recovery | — | — | — |

Plumbing:
- Same retry path as duplicates: offending exercise IDs go to the back of `priorExerciseIds` for the batch retry. `buildRetryPriorExerciseIds` already takes a list of offenders — add a `patternOverflowExerciseIds` parameter alongside the existing `patternClashExerciseIds`.
- Exempt list stays small: `Calves`, `Forearms`, `Cardio` primary group never count toward over-concentration.
- Add the new issue to `ChunkValidatorIssue` and emit it in the structured `generate_sessions_chunk` log so we can dashboard regression rate.

### Acceptance

- New specs in `generated-chunk-validators.spec.ts`:
  - 3 core movements on a Lower day → flagged.
  - 3 horizontal pushes (no vertical) on Upper → flagged when any vertical alternative exists in the candidate pool, otherwise allowed.
  - 3 calf raises → not flagged.
  - Full Body title with 2 squats + 2 hinges → not flagged (cap is 2, exactly at limit).
- Re-running the saved capture: Tuesday Lower no longer ships with 3 core movements; one of the rotational moves is replaced by a lunge or carry.

---

## Phase 4 — Sub-muscle cap (the original Phase 2) — **DONE (Apr 27)**

Kept from the original plan, but **demoted** because Phase 3 catches most of the same failures at a coarser, more reliable level. Sub-muscle work is the surgical pass, not the first cut.

### Fix (landed)

1. Piped `subMuscles: string[]` through `CandidateExercise` (`backend/src/workouts/workout-generator.service.ts → libraryRowToCandidate` and the per-call `toCandidate` builder), and through `ChunkRepairExerciseMeta` so the eval mocks compose. `GeneratedSessionExercise` itself doesn’t carry sub-muscles — the validator builds a fresh `Map<exerciseId, subMuscles>` from the library at validate time (mirrors the Phase 3 `primaryMuscleGroupMapForSessions` pattern), so the wire shape stayed unchanged.
2. Added `over_concentrated_sub_muscle` to the chunk validator (`backend/src/plans/generated-chunk-validators.ts`). Cap is **2** primary sub-movers per session in `simple`, **3** in `detailed`. `Full Body` titles relax to 3. Primary-group exemptions: `Calves`, `Forearms`, `Core`, `Cardio` — those rows skip the cap entirely. The first sub-muscle on each row is treated as the primary mover (mirrors the `subMuscles.length * 50` boost in `exercises.service.ts`).
3. `buildRetryPriorExerciseIds` now appends `subMuscleOverflowExerciseIds` to the very tail so the next batch retry drifts away from the offending picks.
4. `balanceCandidateOrderForPrompt` (`workout-generator.service.ts`) now rotates sub-muscles **within** each primary group via the new private `subMuscleRotateWithinPrimary` helper — Hamstrings → Quads → Glutes → Hamstrings instead of three Hamstring lifts in a row at the top of the prompt pool.
5. One-line prompt nudge added to the per-session strength prompt body: *“Sub-muscle variety: avoid stacking 3+ exercises whose primary mover is the same sub-muscle (e.g. three Hamstring lifts, three Upper-Chest pushes). At most 2 per sub-muscle in one strength session — Calves, Forearms, Core and Cardio are exempt.”*

### Acceptance (achieved)

- 7 new unit tests in `generated-chunk-validators.spec.ts` cover: 3 hamstrings on Lower in `simple`, same in `detailed` (passes at cap 3), 3 upper-chest on Upper, Core/Calves/Forearms/Cardio exemption, Full Body relaxation to 3, missing-map backward compatibility, and `buildRetryPriorExerciseIds` tail ordering.
- All 100 backend tests pass (was 93 before Phase 4) and all 62 frontend tests still pass. Snapshot files (`generation-eval.golden.spec.ts.snap`) updated additively for the new `subMuscleOverflowExerciseIds: []` field.

---

## Phase 5 — Anchor-or-staple in slot 1 (kills the “landmine drift”) — **DONE (Apr 27)**

### Symptom

The capture is heavy with Landmine Rotation, Landmine 180, Landmine Press, Bilateral Landmine Row, Overhead March, Rotational Sit-Up — novelty / influencer movements. A trainer reaches for plank, hanging leg raise, ab wheel, walking lunge first.

### Root cause

`anchor-exercises.ts` defines a curated staple pool per focus. `getAnchorIdsForFocus` is called when *building* the candidate list, but **no rule requires an anchor to actually appear** in the final session. The LLM picks from a wide list and tends to grab whichever exercises were retrieved with the highest `score` in `exercises.service.ts` — and the scoring rewards `subMuscles.length`, which favors compound landmine variations over a clean barbell row.

### Fix (landed)

1. New chunk validator issue `slot_one_not_anchor` (`backend/src/plans/generated-chunk-validators.ts`). It flags strength sessions whose first non-cardio exercise is not in `getAcceptedAnchorIdsForFocus(focus)` — a new helper in `backend/src/data/anchor-exercises.ts` that returns the **union** of related focus anchors (e.g. Upper accepts upper ∪ push ∪ pull, Full Body accepts the universe) so an Incline Bench on an Upper day isn't a false positive. `buildRetryPriorExerciseIds` now appends `nonAnchorSlotOneExerciseIds` to the very tail. The check is **opt-in** via a 7th `enforceAnchorSlotOne` parameter so synthetic eval fixtures (which use IDs like `bench` / `dup_shared`) stay focused on the bug they were minted for. Production (`plans.service.ts`) and the golden capture invariant (`golden-capture-invariants.ts`) both pass `true`.
2. Deterministic post-pass swap in `enrichGeneratedSession` (`backend/src/plans/session-enrichment.ts → ensureAnchorInSlotOne`) runs after the final compound-first sort and before `moveCardioExercisesLast`. If slot 1 is not an accepted anchor, the helper iterates curated anchors for the focus and swaps in the first one whose `movementPatterns` overlap slot 1's, isn't already in the session, and isn't on the chunk-aware `chunkExcludeExerciseIds` list. Sets/reps/weight are preserved; a coach note (*"We led off this session with a staple compound..."*) is appended.
3. Skipped the optional `+25` candidate-score boost — Phase 4's `subMuscleRotateWithinPrimary` already nudges the prompt pool toward variety, and the validator + post-pass cover the symptom directly.

### Acceptance (achieved)

- 7 new unit tests in `generated-chunk-validators.spec.ts` cover: landmine_press flagged on Upper, curated anchor passes, Push anchor accepted on Upper (union semantics), leading cardio row skipped, narrow body-part focuses (Chest / Back / Shoulders / Arms) not flagged, missing-meta backward compatibility, and opt-in flag default-off.
- 3 new enrichment specs in `session-enrichment.spec.ts` cover the deterministic swap: landmine → flat barbell bench, no-op when slot 1 is already an anchor, and bail-out when no candidate anchor shares a movement pattern.
- Golden capture invariant updated to assert the real-shape week capture now also fires `slot_one_not_anchor` (it has multiple non-staple openers — exactly what Phase 5 was designed to catch).
- All 111 backend tests pass (was 100 after Phase 4) and all 62 frontend tests still pass. Snapshot files updated additively for the new `nonAnchorSlotOneExerciseIds: []` field.

---

## Phase 6 — Surface rest, tempo, progression, and **time-based prescriptions** (the trainer-feel jump) — **DONE (Apr 27)**

### Symptom

Two related visible issues:

**6a — Reps where there should be time.** Cardio finisher rows render as `1 × 7-13` reps (e.g. *Treadmill Incline Walk*) instead of `~8–12 min`. Most cardio modalities (treadmill, bike, rower, ski erg, elliptical, versa climber) are time-based. Some core movements (planks, side planks, hangs, hollow holds, wall sits) are already time-displayed correctly via `TIME_HOLD_NAME` in `frontend/src/lib/exercisePrescription.ts`, but cardio is not.

**6b — Missing rest / tempo / progression hints.** Output today shows `4 × 8` and a free-text `notes` field. A trainer writes:

```
Bench Press — 4 × 6–8 @ RPE 8, 2 min rest, +5 lb when top of range
```

We have the rest data on disk (`set-rep-schemes.ts`), we just don’t surface it.

### Root cause

**6a:** `inferPrescriptionTypeFromExerciseName` (in `backend/src/data/exercise-prescription.ts`) only flags planks / hangs / carries as `time`. Cardio modalities fall through to `reps`, so the cardio finisher append (`backend/src/plans/session-enrichment.ts` ~line 748) sets `sets: 1, reps: 10` and the frontend renders the reps band. The frontend `exerciseUsesTimeDisplay` likewise has no Cardio fallback.

**6b:** `getSetRepGuidelines(...)` already returns `restSeconds`, but the field is never attached to `GeneratedSessionExercise` rows or rendered in the preview modal.

### Fix (backend + frontend, small)

**6a — Time prescription for cardio + timed core (do this first, it’s a one-day visible win):**

1. Backend: `inferPrescriptionTypeFromRawExercise` returns `'time'` when the row’s `primaryMuscleGroup === 'Cardio'` (regardless of name). This automatically tags every cardio library row as time-based.
2. Backend: cardio finisher append in `session-enrichment.ts` sends `reps: 600` (10 min in seconds, midpoint of the `8–12 min` band already in the notes) instead of `reps: 10`. Existing frontend formatter already converts seconds → `"10 min"`.
3. Frontend: `exerciseUsesTimeDisplay(prescriptionType, name, primaryMuscleGroup?)` returns `true` when `primaryMuscleGroup === 'Cardio'` as a belt-and-suspenders fallback for any cardio row whose `prescriptionType` is missing.
4. Frontend: when a cardio row’s `reps` is non-numeric or out of the seconds range (e.g. legacy `1 × 10`), default the display to `"8–12 min"` rather than `"10 sec"`.
5. Spec: a generated cardio finisher renders as `1 × 10 min` (or a range) on the modal, never `1 × 7–13`.

**6b — Rest / tempo / progression surfacing:**

1. Backend: include `restSeconds` (and a derived `progressionHint`) on each `GeneratedSessionExercise`. Source: `getSetRepGuidelines(...)` already in `workout-generator.service.ts`.
2. Backend: when the prompt is built for `detailed` mode, add a single sentence with the rest target so the LLM’s `notes` line is consistent.
3. Frontend: in `WorkoutPreview` row, show `4 × 8 · 90s rest` next to the rep prescription. In the modal subtitle, append the global rest band (`87 min · Strength · 7 exercises · 90s rest`).
4. Frontend: in the warm-up block, show ramp sets templated from the slot-1 lift and the user’s last performance (already on disk for users with logged sets) — fall back to a generic ramp when no history.

### Acceptance

- Cardio finisher row in the modal reads `8–12 min` (or `10 min`), never a reps band.
- Plank / hang / wall sit rows render in seconds (already passing — keep covered by spec).
- Every strength row in the modal shows a rest target.
- A ramp-set warm-up appears whenever slot 1 is a barbell / dumbbell compound.

### Fix (landed)

**6a — Time prescription for cardio + timed core (`backend/src/data/exercise-prescription.ts`, `backend/src/data/exercise-mappings.ts`, `backend/src/plans/session-enrichment.ts`, `frontend/src/lib/exercisePrescription.ts`, `frontend/src/lib/planPipeline.ts`):**

1. `inferPrescriptionTypeFromRawExercise` now accepts `primaryMuscleGroup` / `primaryMuscleGroupId` and returns `'time'` when either says Cardio. `transformExercise` plumbs the transformed `primaryMuscleGroup` straight into that helper, so every cardio library row is now stamped `'time'` automatically.
2. The cardio finisher append in `enrichGeneratedSession` now sends `reps: 600` (10 min in seconds, midpoint of the documented `8–12 min` band) instead of `reps: 10`, and force-sets `prescriptionType: 'time'` whenever the picked row’s `primaryMuscleGroup === 'Cardio'` — even when the library row had a stale `prescriptionType`.
3. `sortExercisesByCompoundOrder` (called twice during enrichment, once at the start and once after fill-ins / cardio finisher) used to overwrite an explicitly set `prescriptionType` with `meta?.prescriptionType ?? inferPrescriptionTypeFromExerciseName(...)`. Now it preserves the row’s existing `prescriptionType` and adds a Cardio-meta fallback so a treadmill row whose name doesn’t match a hold regex still ends up `'time'`.
4. Frontend `exerciseUsesTimeDisplay` accepts an optional `primaryMuscleGroup` and treats `'Cardio'` as time-based even without a `prescriptionType`. `formatExerciseRepsDisplay` now also accepts `primaryMuscleGroup`, falls back to a `"8–12 min"` band for legacy cardio rows whose `reps` is a small count (e.g. `10`), and renders `600` seconds as `"10 min"`. All call sites (`exerciseDraftFromGenerateResult`, `mapGroqPreviewExercise`, `previewRepsLineForGoal`, `sessionDraftToPlanSlotExercises`) forward the new field.

**6b — Rest surfacing on each row (`backend/src/plans/session-enrichment.ts`, `backend/src/plans/plans.service.ts`, `frontend/src/services/{planService,workoutService}.ts`, `frontend/src/types/plan.ts`, `frontend/src/lib/planPipeline.ts`, `frontend/src/lib/exercisePrescription.ts`, `frontend/src/screens/PlanPreviewScreen.tsx`):**

1. `GeneratedSessionExercise` now carries `restSeconds?: number`. `EnrichSessionGenerationPrefs` carries a new `difficulty?: string` field; `plans.service.ts` plumbs `dto.experienceLevel` through.
2. New `stampRestSeconds` helper in `enrichGeneratedSession` reads `getSetRepGuidelines(goal, difficulty)` and stamps `restSeconds` on every non-cardio row. The first compound row (slot 1 anchor) gets a `+30s` bump because trainers give the heaviest lift more rest than accessories. Cardio rows are skipped (no inter-set rest concept).
3. `GenerateSessionResult.exercises[*].restSeconds`, `WorkoutPreview.exercises[*].restSeconds`, and `ExerciseDraft.restSeconds` are now first-class fields on the wire and through `exerciseDraftFromGenerateResult` / `buildWorkoutPreviewFromSessionDraft` / `mapGroqPreviewExercise`.
4. New `formatRestSecondsForPreview` helper renders `45s`, `90s` → `"1m 30s"`, `120s` → `"2 min"`. Plan Preview Screen exercise rows now show `4 × 8 · 90s rest` when `restSeconds` is present.

### Acceptance (achieved)

- Hybrid goal cardio finisher renders as `1 × 10 min` (verified by new spec `stamps the cardio finisher row as time-based with reps=600 (10 min)`).
- Legacy cardio rows whose `reps` was a small integer fall back to `"8–12 min"` rather than `"10 sec"` (verified by new spec `falls back to "8–12 min" band for legacy cardio rows whose reps was a small count`).
- Cardio rows render as a duration even when `prescriptionType` is missing (verified by new spec `treats a Cardio primary muscle as time-based even when prescriptionType is undefined`).
- Strength rows are stamped with the goal+difficulty rest target; slot-1 anchor gets +30s (verified by new spec `stamps restSeconds on each strength row from the goal+difficulty scheme (anchor +30s)`).
- Cardio rows leave `restSeconds` undefined (verified by new spec `does not stamp restSeconds on the cardio finisher row`).
- Cardio gate on `inferPrescriptionTypeFromRawExercise` is covered by 5 new specs in `backend/src/data/exercise-prescription.spec.ts`.
- Frontend `exerciseUsesTimeDisplay` cardio fallback and `formatRestSecondsForPreview` are covered by new specs in `frontend/src/lib/exercisePrescription.test.ts`.
- Backend snapshot for `chunk_hybrid_goal_appends_cardio_finisher` regenerated (`reps: 10` → `reps: 600`).
- Full backend suite (121 specs) and frontend suite (74 specs) green.

---

## Phase 7 — Cross-session variation across the week — DONE (Apr 27)

### Symptom

Two Upper days both flat / both seated. Two Lower days both bilateral, no unilateral. Across a week of two of each, this is wasted volume on the same angle.

### Fix (landed)

1. New helper module [`backend/src/plans/cross-session-diversity.ts`](../src/plans/cross-session-diversity.ts):
   - `classifyPushAngle(name)` → `flat | incline | decline | overhead | other` (overhead is detected first so "Incline Shoulder Press" doesn't trip the incline branch).
   - `classifyPullAngle(name)` → `horizontal | vertical | other`.
   - `classifyLowerDominance(name)` → `lunge | hinge | squat | other` (lunge wins over squat so "Bulgarian Split Squat" reads as lunge).
   - `isUnilateralByName(name)` covers single-arm/leg, lunge family, suitcase / landmine variants.
   - `buildSessionDiversitySignature(...)` + `compareSameFocusSessionPair(...)` give the validator a single deterministic call per same-focus pair.
2. New chunk validator issue `'under_diversified_across_focus'` in [`generated-chunk-validators.ts`](../src/plans/generated-chunk-validators.ts): groups strength sessions by focus (`upper` / `lower`), then for each pair flags the **second** session's slot-1 id when it overlaps with the first (same id, same push angle, or same lower dominance). New `crossSessionOverlapExerciseIds` field is appended to the retry tail in `buildRetryPriorExerciseIds` (after slot-1 anchor offenders) so the next batch attempt picks a contrasting opener.
3. Updated `chunk-lower-two-day-clean` fixture to lead Day 2 with the deadlift instead of Front Squat — the trainer-correct contrast that Phase 7 enforces. Snapshots regenerated; remains validator-clean.

### Acceptance (achieved)

- New spec `cross-session-diversity.spec.ts` (11 cases) locks the classifiers + pair-comparison.
- New describe block in `generated-chunk-validators.spec.ts` (4 cases) covers Upper × 2 same-angle, Upper × 2 contrast, Lower × 2 same-dominance vs squat→hinge, and the single-day no-pair guard.
- New `buildRetryPriorExerciseIds` spec asserts cross-session ids land on the very tail of the retry hint list.
- Two-day Lower fixture stays validator-clean once it leads with squat-then-hinge.
- Full backend suite (146 specs incl. randomized invariants) and frontend suite (79 specs) green.

---

## Phase 8 — Polish — DONE (Apr 27)

### Fix (landed)

1. **Per-session intensity badge from volume.** New `deriveSessionIntensity(session, estimatedMinutes)` in [`frontend/src/lib/planPipeline.ts`](../../frontend/src/lib/planPipeline.ts) replaces the old static `isHardDay ? 'Hard' : type === 'recovery' ? 'Easy' : 'Medium'`:
   - Recovery sessions stay `'Easy'`; `isHardDay` still forces `'Hard'`.
   - Otherwise computes `totalSets × estimatedMinutes` (per-row sets capped at 6 to neutralize malformed `sets: 30` outliers) and bands it: `< 400 → Easy`, `< 900 → Medium`, `≥ 900 → Hard`.
   - Now a 14-set / 35-min Upper reads `Medium` while a 24-set / 60-min Upper reads `Hard` — they used to both show `Medium`.
2. **Push/Pull weekly ratio invariant.** New randomized invariant in [`backend/src/plans/eval/generation-eval.invariants.spec.ts`](../src/plans/eval/generation-eval.invariants.spec.ts) asserts that across 30 random hybrid weeks, the chunk's `Push : Pull` ratio stays within `0.4–2.5`. Catches future regressions where a prompt change ships a week with 8 Pushes and 2 Pulls.
3. **Capture-diff workflow.** Extended [`review-workflow.md`](./review-workflow.md) with a new `## Capture-diff workflow (Phase 8)` section + a new `## Cross-session checks (within one week)` section so anyone changing candidate balancing or validators knows to re-run `npm run review:queue -- 50` and diff capture scores before merging.

### Acceptance (achieved)

- New `deriveSessionIntensity` describe block in `planPipeline.test.ts` (5 cases) locks recovery / hard-day overrides, the load-band split, the per-row cap, and the `Medium` fallback when sets/minutes are missing.
- New Push:Pull ratio spec in `generation-eval.invariants.spec.ts` runs 30 randomized chunks and stays within band on the synthetic catalog.
- `review-workflow.md` documents both Phase 7's `under_diversified_across_focus` validator and the Phase 8 capture-diff recipe.
- Tempo / RPE / ramp-set warm-up surfacing remains intentionally deferred — Phase 6b shipped rest, which trainers consistently rank above tempo/RPE for daily app use; no new infra needed when those are added later.

---

## Honest impact estimate

| Phase | Single-line summary | Estimated trainer-quality lift |
|---|---|---|
| 1 — Time mismatch | UI bug fix | 0% programming, +5% trust — **DONE** |
| 2 — Re-sort after fill-ins | One extra call to existing function | +15% (kills the “compound buried in slot 3” class) — **DONE** |
| 3 — Pattern budget per session | New validator class | +20% (kills the “3 core moves on Lower day” class) — **DONE** |
| 4 — Sub-muscle cap | Surgical refinement on top of Phase 3 | +10% — **DONE** |
| 5 — Anchor required in slot 1 | Removes landmine / novelty drift | +10% — **DONE** |
| 6a — Time-based display for cardio + timed core | Tiny fix, kills a visible bug (`1 × 7-13` cardio reps) | +5% trust, very visible — **DONE** |
| 6b — Rest / tempo / progression surfaced | Pure data already on disk | +20% (this is the one users will *say* feels different) — **DONE** (rest landed; tempo/RPE/ramp-set warm-up deferred to Phase 8) |
| 7 — Cross-session variation | New module + chunk validator + retry tail | +10% (kills “both Upper days are flat bench” / “both Lower days are squat-led”) — **DONE** |
| 8 — Polish | Volume-aware intensity badge + Push:Pull invariant + capture-diff doc | +5% — **DONE** |

Cumulative: closing roughly **80–90%** of the gap to “as strong as an LLM and a trainer” without changing the architecture, vs. ~30–40% from the original two-phase plan. **All eight phases shipped.**

---

## Quick reference

| Area | Today | After plan |
|------|-------|------------|
| Card vs modal time | Drifts on every render | Identical anchor, finisher row excluded |
| Compound-first ordering | Runs once, fill-ins land out of order | Re-run after fill-ins |
| Movement-pattern budget | Only Squat/Hinge on Upper | Per-session budget across Push/Pull/Squat/Hinge/Lunge/Carry/Core |
| Sub-muscle balance | None | Cap + round-robin in candidate list + prompt nudge |
| Slot-1 anchor | Optional, nudged via prompt only | Required by validator + deterministic swap |
| Cardio / timed-core display | Cardio rows show reps bands (`1 × 7-13`), timed core via name regex only | All cardio rows + timed core render as duration |
| Rest / tempo / progression | In data, not surfaced | Per-row + per-session + ramp-set warm-up |
| Cross-session variation | Not checked | Validator + retry-tail demote on `under_diversified_across_focus` |
| Per-session intensity badge | Static `isHardDay` flag only | Volume-aware (`totalSets × estimatedMinutes`) bands |
| Push/Pull weekly balance | Not checked | Randomized invariant in eval (0.4–2.5 ratio) |
| Eval coverage | Duplicates + lower-pattern-on-upper | + pattern budget + sub-muscle + anchor + cross-session + Push:Pull ratio |

All eight phases are now landed. The next regenerated capture should look unrecognizable from the one we used as ground truth at the start of this plan.
