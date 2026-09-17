# Plan generation rebuild: the build log

One document for all the work that follows the 2026-09-16 review
(`docs/audits/2026-09-16-plan-generation-deep-dive.md`). Newest entries at the
bottom of each tier. Every entry says what changed, where, how it was verified,
and what was deliberately left out. Baseline numbers live in
`docs/plan-generation-baseline.md`.

Status legend: DONE (shipped and verified) · IN PROGRESS · NEEDS-DYLAN · PARKED.

---

## Tier 0: quick wins (DONE 2026-09-16)

Backend, deployed to Render on push (commits 88fc83c, 1a60744, a60c41d):

| Change | Where | Verified by |
|---|---|---|
| Rest by role: main lift base×1.5 (120–240 s), second compound base×1.25 (90–180 s), isolation base×0.75 (60–90 s), core and holds 60 s | `data/set-rep-schemes.ts` `getRoleRestSeconds`, `plans/session-enrichment.ts` | spec updated (180/150/90 for strength intermediate); rig run showed 120/90/60 for a muscle plan |
| Short sessions hold 3–5 lifts (≤40 min), 4–6 (≤55), 5–8 (above), instead of 5–6 / 6–8 / 7–10 | `workouts/workout-generator.service.ts` `exerciseTargetsForSession` | two spec expectations moved; rig run produced 3–4 lifts at 4 sets |
| Session names rebuilt from the final lifts after every rule pass | `plans/session-title.ts` (+spec), called at the end of `applySessionEnrichment` | 7 spec cases incl. the review's "Press + Pull-Up" and "Trap + Hip" |
| Home equipment checklist reaches the generator (mapped tags + Bodyweight) | `plans.service.ts` `resolveGeneratorEquipment` | tsc + suite; client sends tags for home (below) |
| Hard days on the rule-based path use the user's level, never "advanced" | `plans.service.ts` hybrid chunk | suite |
| `generate-single-session` takes `experienceLevel` and `cardioModalities` (docs/future.md issue 4) | `dto/generate-single-session.dto.ts`, `plans.service.ts` | tsc |
| Response carries `builtBy: ai \| rules \| mixed` | `plans.service.ts` `builtByFromChunkPaths` | preview showed "Built with AI" on the rig |

Client, rides the next binary (commits 11b0310, 68797c3, 4b1b1b9):

| Change | Where | Verified by |
|---|---|---|
| Plans default to four weeks | `GeneratePlanScreen.tsx` | rig: "Generate 4-Week Plan" |
| Home equipment tags sent | `lib/planPipeline.ts` | tsc |
| Preview says who built the week | `lib/planGenerationSummary.ts` `builtByLine`, `PlanPreviewScreen.tsx` | test + rig |
| One plain generation error message; internals go to the console | `lib/planPipeline.ts` `GENERATE_SESSIONS_GENERIC_MESSAGE` | test |
| Swap-type days get content before Apply (July checklist 4.5) | `PlanPreviewScreen.tsx` `handleApply` | tsc; the preview endpoint fills the day |
| "Build muscle" goal → backend `hypertrophy`; profile Hypertrophy maps to it | `types/plan.ts`, `GeneratePlanScreen.tsx`, `planInputs.ts`, `planPipeline.ts`, `planGenerationSummary.ts`, `PlanPreviewScreen.tsx`, `types/navigation.ts` | rig: muscle plan came back 4×8-12 / 4×10-15 |
| Logo mark replaces the Skia bench-press loader (breathing, staged copy, never a meter) | `components/PlanBuildLoader.tsx`; `BenchPressLoader.tsx` deleted | rig screenshot mid-breath with "Picking your exercises" |

Deliberately not done in Tier 0: the What's New card (written when the next
build is cut); a phone pass (no device here).

## Tier 1: measure first (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| The coach check: weighted sets per muscle (0.5 credit for secondary movers) vs a goal/level band, exposures, hinge/press stacking, rest by role, beginner skill gate, load/RIR presence | `plans/coach-check.ts` (+8 spec cases) | spec, incl. the review's sample week reproduced as findings |
| Six eval dimensions (+28; ceiling 140 → 168); fixture gates ≥152 / avg ≥156 from the measured 158.8 avg and 154 min | `eval/eval-scoring.ts`, `eval/generation-eval.scoring.spec.ts` | 67 suites / 902 tests |
| `coachCheck[]` on the generate-sessions response; `coach_check` log event | `plans.service.ts` | tsc |
| Baseline: 77 old captures mean 146.7/168; effortTarget 2%, stacking 45%, weeklyVolume 67%, exposure 73%, rest 76% | `docs/plan-generation-baseline.md` | `npm run eval:captures:report` |

Refinements after the first measurement: pressing stacks count compounds only
(bench + press + pushdown is a normal upper day); a rep range alone is not an
effort target because every row has one.

---

## Tier 2: the prescription layer (IN PROGRESS, started 2026-09-17)

Order of work, by measurable impact: (a) an effort target on every strength
row, (b) sets allocated from the weekly per-muscle tally and the session's
minutes, with stacking held to two, (c) skill gate and joint-tag prefilter at
selection, (d) loads from history and a calibration week, (e) cardio
progression. Each step lands with its spec and is re-measured; the last step
re-drives the 2026-09-14 captures through the whole pipeline and compares
with the 147 baseline.

### 2a. An effort target on every strength row (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| `targetRir` on the generated row: compounds 2 RIR, isolation 1 (2 for strength and endurance goals), core 2; beginners +1; endurance support lifts 3; advanced isolation −1 | `data/set-rep-schemes.ts` `getRoleTargetRir`, `session-enrichment.ts` `stampSetsAndReps` | enrichment spec: strength intermediate rows read [2, 2, 2] |
| Drift by phase: progression −1, peak −2, deload +2; compounds floor at 1, isolation may reach 0; cap 4 | `week-progression.ts` `rirShiftForPhase`, `clampRir` | progression spec: [2,1] → [1,0] → [1,0] → deload [4,3] |
| Persisted: `plan_exercises.targetRir` (additive migration, runs on Render's pre-deploy), accepted by `PlanSlotExerciseDto`, written on every slot create path | `prisma/schema.prisma`, migration `20260917000000_plan_exercise_target_rir`, `plans.service.ts` (5 write sites) | tsc; 11 suites / 135 tests around it |

Deliberately not done here: the client does not yet show or persist the
target (2a-client below); the model is never asked for it.

### 2a-client. The effort target rides through the client (DONE 2026-09-17)

`targetRir` on `GenerateSessionResult` rows, `ExerciseDraft`, `PlanSlotExercise` and `ApiPlanExercise`; `exerciseDraftFromGenerateResult` and `sessionDraftToPlanSlotExercises` carry it, so an applied plan persists it (holds excluded). Not shown anywhere yet (Tier 3).

### 2b. Sets allocated from the week (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| Per-week allocation after the pattern floors and before progression: muscles under the band gain sets on their best row (compound first, most spare session time first, role ceilings main 6 / compound 5 / isolation 4, never past the session budget); muscles over the band lose sets from accessories (never the main lift, never below two); leftover time adds one set to the main lift while its muscle stays in band | `plans/weekly-volume-allocation.ts` (+6 spec cases), called from `applySessionEnrichment`, logged as `weekly_volume_allocation` | spec: the review's two-set shape grows back rows to the band in a 60-minute slot and cannot in a 30-minute slot; an over-volume leg week trims isolation first |
| Session time model: minutes minus a 6-minute warm-up minus the cardio tail; a set costs its row's rest + 35 s (holds cost their duration) | same | spec |

68 suites / 909 tests. Deliberately not done: selection changes (a muscle with no direct work stays untrained here; that is the prompt and the pattern floors).

### 2c. Gates at selection (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| `avoidJoints`: rows the joint-demand audit marks as loading an avoided joint never enter a candidate pool (batch program, single session, and the pool fallbacks). Joints come from the user's avoid phrases (`jointsFromAvoidPhrases`). | `exercises.service.ts` `getCandidatesForGenerator`, `workout-generator.service.ts` `candidateGates` | real-catalog spec: a knee-avoid lower-body pool contains no knee-tagged row |
| `excludeTechnical`: beginners' pools drop Olympic pulls and derivatives, pistols, muscle-ups, handstands, push press, get-ups, kipping (`data/technical-lifts.ts`, shared with the coach check) | same | real-catalog spec: technical lifts present in the open pool, absent in the gated one, back squat kept |

69 suites / 912 tests. Deliberately not done: the pattern-floor and repair pools keep their own name-based avoid filter (they insert staples, not technical lifts).

### 2d. Loads from history and a calibration week (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| Every strength row whose lift the user has logged gets a working weight: Epley e1RM from the best logged set (a logged working set is read as taken with 2 in reserve, so "what you did" comes back as "what you did"; 12-rep cap and single-rep rule mirror the client), inverted at the row's own reps and effort target, rounded to a plate (5 lb from 20 lb up, 2.5 below). Runs after the week progression, so a progression week loads heavier and a deload lighter from the same history. | `plans/load-from-history.ts`, wired in `plans.service.ts` `applySessionEnrichment` (now takes `userId`; `generateSessions` and `repairProgramSessions` pass it) | 10-test spec: same reps same effort returns the logged load; peak heavier / deload lighter; above-window sets fall back to the best set only when reps are close |
| A first-week main lift with no history gets a calibration note ("work up over 2-3 sets to one set of N with about R left, log it, and your next plan builds its loads from it"). Accessories without history stay unloaded on purpose. | same | spec: calibration lands on week-one bench only, never on the curl |
| Never loaded: bodyweight-only, core, holds, time and cardio rows. A model-guessed weight is replaced when history exists and left alone when it does not. | same | spec |
| History read is one `fetchLastEntriesForExercises` call over the program's trackable ids; a failed read logs `loads_from_history_skipped` and the plan ships unloaded. | `plans.service.ts` `stampLoadsFromUserHistory` | 70 suites / 922 tests |

Log line per generation: `loads_from_history { liftsRequested, liftsWithHistory, rowsLoaded, rowsCalibrated }`. Deliberately not done: no load for weeks 2+ of a lift the user first logs *during* the block (that is Tier 4's post-session check-in); no per-user unit (weights stay canonical pounds, the client formats).

