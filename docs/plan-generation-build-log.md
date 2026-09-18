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

### 2e. Cardio progression and two prompt rules (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| A cardio day's main block moves with the phase: +10% on a progression week, +20% on a peak (capped at the slot minus the 15 min of warm-up, cool-down and core), -25% on a deload with its own reasoning note; floor 8 min; rounded to whole minutes. Weeks 2+ used to clone week 1's cardio unchanged. | `week-progression.ts` `progressCardioSession`, `cardioDurationFactorForPhase` | 4 new tests (28 in the two specs): 25 min → 28 / 30 / 19; foundation untouched; a day with no timed block untouched |
| Template copy is rewritten so the minutes in the note match the stamped duration (the eval's copy-sanity check); interval copy stays interval copy; a model-written note that names no minutes is left alone. | `cardio-day-template.ts` `cardioMainBlockNotes`, `cardioBlockStyle` | same spec |
| Batch prompt rules (6) stacking caps: at most two pressing compounds and two hinges per session; (7) frequency: with 3+ lifting days each big muscle on at least two days. The coach check already scores both. | `workout-generator.service.ts` system prompt | prompt text only; measured by the re-drive below |

70 suites / 926 tests. Deliberately not done: no cardio progression inside a strength session's finisher tail; no interval-structure change on a peak (only the block length moves).

### Re-drive after 2e (2026-09-17)

Three 2026-09-14 `generate_sessions` captures replayed through the pipeline (`npm run eval:drive`, no user history): **155.0 → 161.3 / 168** on the same inputs (target was 160). effortTarget 0 → 4/4, fatigueStacking 4.3 → 5.7, workoutOrder 6.7 → 7.7, patternStacking 1.3 → 2.7. Full table and the coach's read of what was still wrong in `docs/plan-generation-baseline.md` ("Re-drive after Tier 2").

### 2f. What the re-drive showed (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| Press and hinge stacks repaired deterministically: the third pressing compound (or third hinge) in a session becomes an isolation for the same primary muscle from the catalog, under equipment and avoid list, not already used that week, with the isolation scheme, rest and effort target. Runs after the pattern floors, before allocation. The prompt rule alone did not hold (push-up + overhead press + dip on a Push day). | `plans/pattern-stacking-repair.ts`, wired in `plans.service.ts` | real-catalog spec: Push day loses its third press to a chest isolation and the coach check's stacking finding clears; week-unique picks; Legs day capped at two hinges |
| A push-up, inverted row, bodyweight squat, glute bridge, wall sit or step-up never leads a day that has a loaded compound (compound-first sort, shared with the eval's ideal order so the score stays aligned). Pull-ups and dips are not penalised: they are main lifts. | `session-enrichment.ts` `compoundSortScore` | full suite |
| A pattern-floor insert carries the effort target (a band lat pulldown had none). | `week-pattern-floors.ts` | full suite |
| Batch prompt: on hybrid days the cardio finisher is counted outside the lifting range ("4-6 lifts + 1 cardio finisher, cap 7"). | `workout-generator.service.ts` day line | prompt text |
| Client: the split recommender knows the training age and counts lifting days; with three or fewer, push/pull/legs and body-part weeks (each muscle once) lose to full body and upper/lower (each muscle twice), more for a beginner. Both call sites pass experience. | `planRecommendation.ts`, `planPipeline.ts`, `GeneratePlanScreen.tsx` | new test: strength and hybrid at three days, every experience → full body or upper/lower (17 tests in the suite); 58 lib tests green |

71 suites / 929 backend tests; frontend `tsc` clean.

Re-drive after 2f, same three inputs: **161.7 / 168** (156, 164, 165). patternStacking 2.7 → 4/4 on all three. Still open, and honest about it: (1) hybrid days at a 30-60 window plan the lifting from the 45-minute midpoint, so an advanced day is three lifts and a 10-minute finisher (~12 sets) and the scorer calls it light; (2) an advanced gym plan still picks goblet squats, bodyweight squats and push-ups as lifts; (3) the beginner capture's push/pull/legs skeleton came from the client, so the replay cannot show the new split rule. (1) and (2) are 2g.

### 2g. The hybrid window and an advanced-gym gate (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| On a day whose goal appends a cardio finisher (hybrid, fat loss, endurance), the lifting is planned at the window's midpoint plus the finisher's 10 minutes, capped at the window's top. The batch prompt's exercise range, the enrichment caps and the weekly allocator's time budget all use the same number (`plannedLiftingMinutes`), so a 30-60 hybrid day is 3-4 lifts, core and the tail (15-16 sets) instead of three lifts and a jog (12). A fixed window still pays for the tail out of lifting time. | `workout-generator.service.ts` `plannedLiftingMinutes`, `plans.service.ts` prefs, `weekly-volume-allocation.ts` budget | 3-test spec for the minutes; allocator spec: a tail does not reduce the lifting budget in a 30-60 window and does in a fixed 45 |
| Advanced lifters with gym equipment (a bar, cables or machines) no longer get push-ups, bodyweight squats, glute bridges, inverted rows, wall sits, burpees in the candidate pool; pull-ups, chin-ups, dips and hanging work stay (`BASIC_BODYWEIGHT_NAME`). | `exercises.service.ts` `excludeBasicBodyweight`, `candidateGates(limitations, difficulty, equipment)` | real-catalog spec (the pool is a shuffled slice, so the kept set is asserted on the predicate; a first version of the test was flaky for that reason and was fixed) |

72 suites / 935 tests.

Re-drive after 2g, same three inputs: **164.3 / 168** (162, 165, 166). Sequence on the same inputs: 155.0 (old pipeline) → 161.3 (2e) → 161.7 (2f) → 164.3 (2g). weeklyVolume 6 → 7.3, muscleExposure 2 → 2.7, coachingProDepth 6.7 → 7. Still open: a goblet squat can lead an advanced lower day (a loaded lift, but not the one a coach would pick first); one beginner day still reads light to the scorer (13 sets in a 30-45 window, which is right for a beginner); the beginner capture's push/pull/legs skeleton is a client decision the replay cannot change.

**Tier 2 is done.** Everything above is server-side and live on the next Render deploy (auto-deploy on push to main); the one client change (three-day split rule) rides with the next binary or OTA.

## Tier 3: show it (client; needs a binary or OTA; started 2026-09-17)

### 3a. Load, effort and rest reach the preview, the saved plan and the deck (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| The draft row carries the generator's working load. It was dropped on the way in: `ExerciseDraft` had no `weight`, so Tier 2d's loads were neither previewed nor saved. Apply now sends load, effort target and rest with each slot exercise. | `types/plan.ts`, `planPipeline.ts` (`exerciseDraftFromGenerateResult`, `sessionDraftToPlanSlotExercises`) | pipeline test: bench keeps load, effort and rest; a hold keeps rest but never an effort target |
| Rest between sets is persisted: `plan_exercises.restSeconds` (nullable), accepted on the slot DTO, written at every site that writes `targetRir`. The deck guessed rest from the exercise name before. | `schema.prisma`, migration `20260917100000_plan_exercise_rest_seconds`, `create-plan.dto.ts`, `plans.service.ts` | backend suites; deploy the backend before the client (the DTO must accept the field) |
| Preview row: `4 × 8-12 · 135 lb · 2:15 rest · 2 in reserve`; the calibration note shows as the row note. | `PlanPreviewScreen.tsx`, `exercisePrescription.ts` `formatEffortTarget` | 4 prescription tests |
| Workout deck: the plan's rest when the row has one (heuristic only for older rows); the target line adds the effort target (`Target 8-12 · 135 lb · 2 in reserve`). | `planCalendarPrototypeStore.ts`, `PlanCalendarWorkoutScreen.tsx` | `formatRestClock` tests; store tests |

### 3b. The preview opens with the week at a glance and the coach check (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| Under the week tabs: one line per training day (date from the plan's start date, day title, first lift, minutes). | `PlanPreviewScreen.tsx` | type-check; visual pass on the web rig below |
| The coach check in a sentence ("a balanced week", or the first real note with a count of the rest) with every note and sets per muscle against the goal's band behind a tap. The report rides in the draft's debug metadata; the server now includes the band it measured against. | `coach-check.ts` (`band`), `planService.ts`, `planPipeline.ts`, `planGenerationSummary.ts` `coachCheckHeadline` / `coachCheckDetailLines` | 2 summary tests |

### 3c. Rebuild a day, swap everywhere, sticky swaps, generation that outlives the screen (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| "Rebuild day" in the day sheet: one spec is regenerated and the program repair runs across the plan so the day still fits the week. | `planPipeline.ts` `regeneratePipelineDay`, `PlanPreviewScreen.tsx` | type-check; rig pass |
| The swap control asks "this week or every week" on multi-week plans; every swap is recorded and re-applied after a week or day rebuild wherever the rebuilt day still carries the original lift (the rebuilt day itself stays fresh). | `planPipeline.ts` `applyRecordedSwaps`, `RecordedSwap` | 3 pipeline tests |
| The generation request is no longer aborted on unmount: held by draft id, a remount joins it, and a finished run persists its draft itself. Backing out to edit one field no longer pays twice. | `planGenerationKeepAlive.ts` | 3 tests |

Deliberately not done in Tier 3: no per-user unit on the server (loads stay pounds, the client formats); no "keep alive" across an app kill (the persisted draft covers that already); the older Groq per-card preview path is untouched.

### 3d. Web-rig pass (DONE 2026-09-17)

Real 4-week muscle plan generated on the web rig (local backend on 3005, real Gemini, throwaway Postgres; the rig needs `EXPO_PUBLIC_SUPABASE_URL=http://localhost:9999` and `CORS_ORIGINS=http://localhost:8090`). Seen: the glance list (dates, titles, minutes), the coach sentence with the per-muscle detail behind the tap, rest and effort on every strength row, the calibration note on the main lift, "Rebuild day" in the sheet regenerating one day (a second generate-sessions call plus the program repair; warm-up, why and cool-down changed). Three things fixed from the look: the glance line repeated the title's own lift suffix; a helper-only muscle read "over 0 days"; core was flagged over the band on any lower-body week (half-credit from every squat and hinge), so core is no longer flagged high. Unverified on a phone (no binary yet): the deck's target line and rest clock.

## Tier 4: make the plan live (server + client; started 2026-09-17)

### 4a. Post-session check-in → next week's sets (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| Three answers after a session (it felt easy / about right / too hard; soreness none / some / a lot; joints fine / a niggle / pain) stored on the workout log (`effort`, `soreness`, `jointPain`, `checkInAppliedAt`), inline with the POST or via `PATCH /workout-logs/:id/check-in`. | `schema.prisma`, migration `20260917120000_workout_log_check_in`, `check-in.dto.ts`, `workout-logs.controller.ts`, `workout-logs.service.ts` | full backend suite (73 suites / 944) |
| The rule, applied once to the same weekday of the next week in the plan: too hard, a lot of soreness or joint pain takes one set off every accessory (never below two); joint pain also holds the main lift back one rep in reserve; an easy, clean session adds one set to every accessory (never above five); about right or mixed answers move nothing; time rows never move. Each touched row gets a plain note; the response carries a one-sentence summary. | `workout-logs/checkin-adjustment.ts` (pure) | 6-test spec |
| Client: "How did it go?" card on the finish screen; once all three are answered the store sends them (PATCH when the day's log exists, otherwise queued and carried inside the log POST, persisted like a pending completion); the server's sentence shows under the card and is kept for a recap. | `PlanCalendarWorkoutCompleteScreen.tsx`, `planCalendarPrototypeStore.ts` `submitCheckIn`, `types/workout.ts` | type-check + lint; store suites green. Deliberately not done: no store test for the queued path (the persistence harness simulates a server; adding a scenario there is a follow-up) |

### 4b. A stalled lift deloads on purpose (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| Loads from history read the last three sessions of each lift. Three sessions at the same top load (within 2.5 lb) with no rep gained from the oldest to the newest is a plateau: the first week's load is cut by a tenth, rounded to a plate, with a plain note; later weeks progress from history as usual. | `load-from-history.ts` `isPlateaued`, `last-performance.ts` `fetchRecentEntriesForExercises` | 3 new tests (13 in the spec): flat = plateau, a rep gained or a load change is not; week 1 at 120 from 135, week 2 at 135 |

### 4c. The next block from this block's logs (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| Apply keeps the plan's inputs (`jim_last_applied_plan_inputs_v1`). When the plan ends, the Home card and the week banner read "Build your next block" and open the form seeded from those inputs, start date moved to the next training day, with a one-line banner. The generator reads this block's logs (4b loads and deloads), so the continuation is offered, never rolled forward silently, and the user still presses Generate. | `planPreviewDraftStorage.ts`, `PlanPreviewScreen.tsx`, `GeneratePlanScreen.tsx`, `HomeScreen.tsx`, `PlanCalendarWeekScreen.tsx`, `types/navigation.ts` | type-check + lint; 677 lib tests. Not verified on a phone. |

**Tier 4 is done.** Server parts deploy with the next push to Render (two migrations: rest seconds, check-in); every client part waits for the next binary or OTA, and the backend must be live first.

## Tier 5: the form (client + a little server; started 2026-09-17)

### 5a. What a coach asks first (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| Server: `priorityMuscle` (one of Chest, Back, Legs, Shoulders, Arms, Core) fills that group toward the top of its weekly band in the allocator and asks the model for it in the first accessory slot on the days it fits. `knownLifts` (up to six typed sets, pounds) stand in for missing history so week one carries loads instead of a calibration note; a real log always wins; a plan with no user or no history still gets its calibration notes. | `generate-sessions.dto.ts`, `workout-generator.service.ts` (prompt line), `weekly-volume-allocation.ts`, `plans.service.ts` | allocator spec: two back rows stop at the floor (8) plain and pass it prioritised; 73 suites / 945 tests |
| Client: three controls under Experience on step 2: "Training now" (0 / 1-2 / 3-4 / 5+ a week; was in the request, never collected), "Bring up" (one muscle), "Your numbers" (bench, squat, deadlift as weight × reps in the user's unit, sent as pounds). All three reach the request through `PlanInputs`; the review step states them back. | `GeneratePlanScreen.tsx`, `planInputs.ts` (`normalizeKnownLifts`), `planPipeline.ts`, `planService.ts`, `types/plan.ts` | input tests (drops incomplete or implausible lifts, one per exercise); web-rig pass of all three steps |

### 5b. The dead controls are gone (DONE 2026-09-17)

| Change | Where | Verified by |
|---|---|---|
| Removed from the form: age, cardio equipment, emphasis, focus, per-day time limits, and the "Start from a template" card (templates stay reachable from the calendar and onboarding), with the handlers, state and styles that only served them. Formats and the weekday/weekend split were never rendered and keep only their state. | `GeneratePlanScreen.tsx` (4,406 → 4,046 lines) | type-check + lint; rig pass: step 2 shows location, experience, the three new sections, equipment, duration, style, split, detail, progression |
| The preview no longer prints "Also on Generate Plan (not in the AI request)": nothing on the form is outside the request now. Helper and test removed. | `PlanPreviewScreen.tsx`, `planGenerationSummary.ts` | summary tests |

Deliberately not done in Tier 5: the one-screen "plan as a sentence" rewrite of the wizard (three lean steps now; a full re-layout is a design call for Dylan and needs a phone pass); the onboarding exit still opens the form rather than auto-generating (the 2026-09 onboarding rework chose a matching moment with a one-tap Start, and changing that exit without a phone pass is not worth the risk).

**All five tiers are built.** Server side is live on the next Render deploy (three migrations since Tier 2: targetRir, restSeconds, check-in). Every client change since Tier 0 waits for the next binary or OTA and needs the backend live first; none has had a phone pass.

### 5c. Web-rig pass (DONE 2026-09-17)

Muscle goal, "Training now 3-4", "Bring up: Back", bench 135 × 8 typed, four weeks generated in 10 s against the local backend. The review step listed all three answers; the request carried `priorityMuscle: Back`, `currentActivityLevel: 3-4`, `knownLifts: [bench 135 × 8]`; week one's bench read "4 × 8 @ 135" from the typed set with no logs at all; Back landed at 20.5 weighted sets (band 8-22) over two days, the highest group of the week; the coach check read "a balanced week". Fixed from the look: the six priority chips squeezed into one row and truncated, now three to a row.

### 3e. The preview redesigned (DONE 2026-09-17)

Dylan's read after seeing the preview as an artifact: too much on the screen after a generation, and the week shown twice (glance list and day cards). Research across Apple Fitness+, Runna, Future, JuggernautAI, Boostcamp, Nike Training Club and RP, plus NN/g's progressive-disclosure guidance, pointed the same way: one list with one card per day and about three facts on it, the plan-level summary as one line or behind "details", controls after the content, explanations on demand at the day level, two levels deep at most. Every edge case raised (day icons, per-exercise swap, exercise detail without leaving the day, cardio and recovery subtitles, rest rows, hard days, deload weeks, coach states, stated line from the effective plan, single-week plans, long titles, busy states, sticky swaps on a week rebuild, the Edit-inputs warning, empty coach sheet, units, dates, accessibility labels) is folded in.

| Change | Where | Verified by |
|---|---|---|
| The list: the plan stated back from the draft ("4 weeks · Upper/Lower · 4 days · 30–45 min"), week tabs (a deload week says so), one coach line (green dot balanced, amber with a note, hidden with no report) whose "Details" opens a sheet of bars against the band with the notes under them, then the days as the only list. Each card: type badge, title, a Hard tag, one line ("Bench press 4 × 8–12 leads · 4 exercises", cardio "25 min treadmill jog · 2 core moves", recovery "easy"), a chevron; rest days sit between. Trash and swap-type stay on the day header. Two chips under the list open the Adjust sheet (rebuild week, cardio only, reduce intensity) and the "How this was built" sheet (the request lines, who built it, the policy line once). Removed: summary tiles, the glance list, the hint paragraph, the inline what-drove accordion, the inline adjust row, the day modal. | `PlanPreviewScreen.tsx` (2,375 → ~1,900 lines), `planPreviewEdits.ts` (`statedPlanLine`, `daySummaryLine`, `weekPhases`) | 7-test spec for the copy and edits; web-rig pass with a real 4-week plan |
| A day is a pushed screen (`PlanPreviewDay`), not a modal: title, date · minutes · count · hard day, Rebuild day; rows first (chip, name, a one-line "how to" fetched once per lift from the catalog, the prescription with load, rest and effort, the note), a swap icon per row (this week or every week on multi-week plans); warm-up / why / cool-down collapsed; the progression rule as a footer; Remove this day at the bottom. Tapping a name pushes the Exercise screen and Back returns to the day (the Calendar stack already registers ExerciseDetail). | `PlanPreviewDayScreen.tsx`, `PlanCalendarNavigator.tsx`, `types/navigation.ts` | rig: exercise pushed and Back returned to the day; Rebuild day changed the day and the list behind it |
| The list and the day share one in-memory preview session (`planPreviewSession.ts`): the list publishes its draft, the day commits swaps, rebuilds and removals, both subscribe. Apply is disabled while anything rebuilds; Edit inputs warns when recorded swaps would be lost; a week rebuild re-applies recorded swaps. | `planPreviewSession.ts`, `PlanPreviewScreen.tsx` | type-check; rig |
| Found on the rig: every week or day rebuild answered 400 since the Tier 5 form fields shipped (the client spreads the generate request into the repair call and the pipe forbids unknown fields). The repair DTO now accepts `priorityMuscle` and `knownLifts`. | `repair-program-sessions.dto.ts` | DTO spec case |

Not verified on a phone: the sheets' swipe-to-dismiss, VoiceOver on the cards, the pushed day's header on iOS 26. The artifact https://claude.ai/artifact/8xm12mwQPurMjFX9oAVwU3 shows the built screens.

Follow-up (2026-09-17, Dylan's "was a confirm built in?"): every destructive or replacing action now asks first. Remove a day (header trash and the day screen's "Remove this day"): Cancel / Remove. Swap the day type: a choice sheet with Cancel. Swap an exercise: This week / Every week / Cancel on multi-week plans, and now Swap / Cancel on a one-week plan too (it used to go straight through). Rebuild day: Rebuild / Cancel (it used to go straight through). Rebuild week, cardio only and reduce intensity sit behind the Adjust chip, two taps by design. Also missed and fixed: a one-week plan showed a lone "Week 1" tab (hidden now); a week rebuild had no visible busy state once the button moved into a sheet (a "Rebuilding week 1…" line under the tabs now, and a "Week rebuilt. Kept your 2 swaps." alert when swaps were re-applied); day headers had no date (now "Monday  Sep 14"). Type-check, lint and lib tests green; not re-run on the rig.

### Logged run through the redesigned preview (2026-09-17, evening)

Web rig, local backend on the latest build, real Gemini. Raw capture: `docs/audits/2026-09-17-preview-rig-run.json`.

| | |
|---|---|
| Inputs | Build muscle · 4 days · 30–45 min · 4 weeks · intermediate · training now 3-4/wk · bring up Back · bench 135 lb × 8 typed |
| Review step | listed every answer, including the three new ones |
| Generation | 10 s, built by the model, split Upper/Lower, no console errors, no 4xx from the backend (the repair fix holds) |
| Stated line | "4 weeks · Upper/Lower · 4 days · 30–45 min" |
| Coach, weeks 1-2 | balanced: Chest 8, Back 15, Legs 22, Shoulders 17, Arms 13 (helper only), Core 25.5 weighted sets |
| Coach, weeks 3-4 | one note each: Legs 24.5 then 26.5 sets, above the 22 band |
| Week 1 Monday | Upper · Bench + Row, hard: DB bench 4×8-12 (calibration note) · bent-over row 4×10-15 · DB shoulder press 4×10-15 · ab wheel 2×12-15; rest 120/90/90/60; 2 in reserve |
| Week 1 Thursday | OHP 4×8-12 · pull-up 4×10-15 · flat barbell bench 4×10-15 @130 lb (from the typed 135 × 8) · side plank 2×40 s |
| Week 4 Monday | same lifts, 5×5-9 / 5×7-12, 1 in reserve (peak week; a 4-week build has no deload) |
| Day screen | rows first with a "how to" line on all four lifts; exercise pushed (Flat Dumbbell Bench Press) and Back returned to the day, then to the list |
| Sheets | coach bars, Adjust, How this was built all opened and closed |

Two things the run shows that are worth fixing next (server, small):

1. **Peak weeks push a muscle over the band.** The allocator fills week 1 to the band, then the week progression multiplies sets (×1.15, ×1.25) with no ceiling, so Legs sits at 22 in week 1 and 26.5 in week 4. The trim pass should run again after progression, or the multiplier should stop at the band.
2. **Trimming can leave a compound at two sets.** Tuesday's Lower has back squat 5 sets, then deadlift 2 and goblet squat 2. A coach would drop the goblet squat and give the deadlift its sets back. The trim should remove the last accessory before it takes a compound below three.

Priority Back landed at 15 sets against a 20 target: the 45-minute budget, not the rule, is the ceiling there; that is honest.

### Re-run after the two fixes (2026-09-17, later)

Same inputs, same rig, backend rebuilt with the post-progression trim and the role floors. Raw capture: `docs/audits/2026-09-17-preview-rig-run-2.json`.

| | |
|---|---|
| Generation | 10 s, model-built, Upper/Lower, no console errors, no 4xx |
| Fix 1 (peak weeks) | no week is over the band any more; the backend logged the trim: week 3 dropped the hip thrust (Legs at the ceiling), week 4 took one set each off deadlift, RDL and hip thrust, then dropped the hip thrust and a second row rather than go lower |
| Fix 2 (compound floor) | no secondary compound below three sets anywhere in the four weeks; the trim removed rows instead |
| Typed bench | 135 lb in week 1 → 140 → 145 → 150 lb across the weeks as reps and effort tightened (4 × 8–12 at 2 in reserve → 5 × 5–9 at 1 in reserve) |
| What this draw got wrong | Chest: 7 sets on one day (bench and dips on Monday; the second upper day is press, row, chin-up, face pull with no chest press). The coach line says so ("Chest: 7 weekly sets, under the 8…" and "trained on one day only"). The week's pattern floors guarantee a horizontal press exists, not that it exists twice. Next fix: an exposure floor for the four big muscles when there are three or more lifting days, filled with an isolation on the day that lacks it. |
| Also worth a look | a four-week "build" profile takes reps from 8–12 to 5–9 by week 4 for a muscle goal; three cuts in a row drift toward strength ranges. Two cuts and a heavier load is what a coach would write. |

### Third run, with the exposure floor (2026-09-17, night)

Same inputs. Raw capture: `docs/audits/2026-09-17-preview-rig-run-3.json`. All four weeks balanced; every big muscle on two days (the floor added a 3-set lateral raise to Upper 2 in each week for shoulders; chest landed on two days on this draw by itself); the post-progression trim held Legs at the band in weeks 3 and 4 and dropped the bodyweight squat before touching a compound. Typed bench came back at 135 lb. No errors, no 4xx.

What this draw shows that the rules do not fix: the model led Monday with a bent-over row, led Tuesday with a goblet squat and put a 4 × 14–19 bodyweight squat on Friday, for an intermediate in a gym. Monday is three lifts and 13 sets. The rules own the numbers; exercise choice is still the model's, and its choice is the weakest part of the plan. That is the case for a stronger model on the week-one design call, or a staple-first selection rule (barbell before dumbbell before bodyweight for the main lift when the equipment allows), before anything else.

Account cleanup (Dylan, `deeish3@gmail.com`, confirmed): 16 plans, 80 plan days, 128 workouts, 7 logs removed; user, preferences, crew and body weight kept; verified empty afterwards. Scripts: `backend/logs/account-inventory.ts`, `account-cleanup.ts` (dry-run by default).


### Research note: model change or call change? (2026-09-17, late)

Dylan asked whether the two weak links (exercise choice and day design; adaptation to the person) need a bigger model, or a different call, and pointed out that a Claude recommending Sonnet is not a neutral witness. Research first, no code. Findings, with what they rest on:

| Finding | Evidence |
|---|---|
| Adaptation is not the model's at all | `frontend/src/lib/planGenerationSummary.ts` builds the profile (foundation 0 reps → progression −1 → progression −2 → peak −3; effort 2 in reserve → 1 → 1 → 0 via `rirShiftForPhase`) and `week-progression.ts` stamps it. A model swap changes nothing here. |
| The pool is fine; the pick is the variance | `getCandidatesForGenerator` sorts by catalog tier, so the 20 lower rows the model sees start deadlift, trap bar, RDL, hip thrust, back squat, front squat, goblet squat, bodyweight squat. Run 2 opened Lower with back squat and front squat; run 3, same inputs, opened with goblet squat and put a 4 × 14–19 bodyweight squat on Friday. |
| Our own validator accepts the weak opener | `goblet_squat` and `bodyweight_squat` are in the `lower` anchor list (for home users), and `slot_one_not_anchor` checks membership, not equipment or level. `excludeBasicBodyweight` only fires for advanced lifters. So the retry that ran on run 3 (`slot_one_not_anchor`, `under_diversified_across_focus`) was satisfied by a goblet squat. |
| Three-lift days are our count target | `exerciseTargetsForSession` sends "3-4 ex" for a 30–45 min day; the model took the floor. |
| One call carries too many constraints | The batch call asks for 4 days × name, reasoning, warm-up, cool-down and exercises in one JSON, under seven numbered rules plus intensity, slot order, naming, tone and progression text, at thinking MINIMAL and temperature 0.73. |
| Repeated generation is unstable on exactly this task | Lee (2026), Gemini 2.5 Flash, 20 runs per case: the healthy "hypertrophy + strength" case had the lowest consistency of six (cosine 0.879, SD 0.052) and its most common weekly frequency pattern covered only 35% of runs; conclusion: reliability "depends substantially on prompt structure" and needs "additional structural constraints". |
| Model size does move expert ratings | BMC Sports Science, Medicine and Rehabilitation (2025): coaches rated 12-week ChatGPT programs 2.37 (3.5) → 3.61 (4o) → 4.14 (4.1) out of 5. OpenAI-only; no Flash-Lite vs Sonnet head-to-head exists. |
| LLMs plan badly out of the box, rank well | Li et al. (2024, includes a fitness-planning dataset): "difficult for LLMs to generate correct plans out-of-the-box", "much better at providing feedback signals ... in the form of comparative heuristic functions". |
| The apps people rate highly don't ask a model to design the day | Fitbod scores every eligible exercise (recovery, goal/experience rating by trainers, feedback history, split rules, equipment) and picks by rank; Alpha Progression and JuggernautAI are rule and periodisation engines. |

Recommendation given to Dylan: no model change yet. Fix the call and the rules first (equipment- and level-aware opener rule, a per-slot ranked shortlist instead of one 40-row table, split the pick call from the copy call, lower temperature on the pick, a minimum of four lifts on a 30–45 min gym day), fix the profile (hold reps, tighten effort once, let the check-in move load), then measure a bigger Gemini through `npm run eval:drive` on the same captures before any provider work. Decision pending.

## Tier 6: the call, not the model (2026-09-17, night)

Dylan: "Begin working on each of these" (the six recommendations of the research note). All server-side except one client line; every client change waits for a binary. Backend must deploy before any client build, as before.

| # | Change | Where | Verified by |
|---|---|---|---|
| 1 | Opener rule: past beginner, in a gym (bar, cables or machines), the light anchors (goblet squat, bodyweight squat, push-up, one-arm dumbbell row, dumbbell RDL) are not openers. The chunk validator flags them, enrichment swaps in the first pattern-matching staple, the prompt says so. | `data/anchor-exercises.ts` (`LIGHT_ANCHOR_IDS`, `getAcceptedOpenerIdsForFocus`, `isGymLikeEquipment`), `generated-chunk-validators.ts` (`openerContext`), `session-enrichment.ts` (`ensureAnchorInSlotOne` takes `difficulty`), `plans.service.ts` (three validator call sites) | `opener-rule.spec.ts` (real catalog: goblet-led Lower becomes back squat for a gym intermediate, untouched at home and for a beginner) |
| 4 | Four lifts from 32 minutes. The model took the floor of "3-4" on a 30–45 minute day (three lifts, thirteen sets). | `exerciseTargetsForSession` in `workout-generator.service.ts` | existing suites (all 963 green after the change) |
| 5 | Progression profile normalised on the server: reps hold across a build, effort tightens by one at the halfway point of the build weeks, a deload keeps +2 reps and +2 in reserve at 90% load, history-derived loads step 2.5% per build week. The client profile sends 0 rep modifiers on build weeks (rides the binary; old clients are normalised anyway). | `plans/progression-profile.ts` (new), `week-progression.ts` (uses `rirShift`; `rirShiftForPhase` removed), `load-from-history.ts` (`loadFactorForWeek`), `plans.service.ts`, `frontend/src/lib/planGenerationSummary.ts` | `progression-profile.spec.ts`, `week-progression.spec.ts` (two tests rewritten: reps hold; effort steps once), frontend `tsc` and 684 lib tests |
| 2 | Per-slot ranked shortlists replace the forty-row table. The rules fix each focus's slot order (`SLOTS_BY_FOCUS`) and rank the options per slot from the catalog tier order; slot 1 offers the validator's accepted openers first; preferred movements and the priority muscle go first where they fit; a row appears in one slot only. Cardio rows ride along. The flat table remains as the fallback for a pool too thin to fill slots. | `workouts/slot-shortlists.ts` (new: `SLOT_KINDS_BY_FOCUS`, `buildFocusShortlist`, `renderFocusShortlist`), `workout-generator.service.ts` (`buildBatchShortlists`), `CandidateExercise.type` | `slot-shortlists.spec.ts` (real catalog: back squat leads, no goblet in a gym, deadlifts kept behind three squats, priority muscle first, render shape); prompt rendered for the rig inputs: about 720 tokens for Upper plus Lower |
| 3 | The pick is split from the copy. The week-one call returns ids, sets, reps and a name per day, at temperature 0.35 with a 1,800-token cap (2,600 with beginner notes); no reasoning, warm-up, cool-down, program summary, meso hint, activity line or progression text. A second small call (`writeSessionCopy`, the old unused `polishSimpleBatchSessionCopy`) writes warm-up and cool-down from the rows the user will actually do, for the first week's strength days, and the clones inherit them. Strength reasoning stays rule-built (it already was). | `generation-schemas.ts` (`pickProgramSchema`), `workout-generator.service.ts`, `plans.service.ts` (`writeWeekOneCopy` at the end of `applySessionEnrichment`) | drives below (`writeSessionCopy` about 450 prompt and 350 completion tokens); the copy call's usage is logged but not in the capture's token totals |
| 2b | The validator and the shortlists had to agree, or every chunk failed its first pass: a Push day is push-pattern by design, so the upper same-pattern cap of three fired on all of them; the retry was told to avoid every id of the first attempt, so the week went to the second-best rows (a chest dip opened Push with the bench unused). Now: Push and Pull days allow five same-pattern rows, Upper and Lower four (the catalog tags curls and raises as Pull); the retry demotes only the rows the validator named (`offendersOnly`); the lower opener list is three squats then two deadlifts so the week's second lower day can be hinge-led; no curls in a push finisher. | `generated-chunk-validators.ts`, `slot-shortlists.ts`, `program-templates.ts` (lower slot descriptions) | `validator-alignment.spec.ts`; first-pass validator issues on the three drives: 100% then 67% then 33% (the last is a band-only beginner opening Pull with a banded pulldown, swapped by enrichment) |
| 6 | Measured a bigger Gemini before any provider work: the same three 2026-09-14 captures, `eval:drive`, Flash-Lite against Gemini 3.5 Flash, twice each, on the new pipeline. | `scripts/drive-generation.ts --model=` | table below |

### Drives (same three captures as the 155.0 to 164.3 sequence; scorer unchanged)

| Pipeline | Model | Mean / 168 | Min / max | First-pass validator issues |
|---|---|---|---|---|
| Tier 0–5 (2026-09-17 afternoon) | flash-lite | 164.3 | | retries on most chunks |
| Tier 6, before the validator alignment | flash-lite | 163.0 | 159 / 165 | 100% |
| Tier 6, before the validator alignment | gemini-3.5-flash | 161.3 | 159 / 164 | 100% |
| Tier 6, aligned | flash-lite | 161.7 | 158 / 164 | 67% |
| Tier 6, aligned | gemini-3.5-flash | 161.3 | 158 / 163 | 67% |
| Tier 6, aligned, lower opener, cap four | flash-lite | 162.3 | 160 / 164 | 33% |

The scorer is flat across all of this (it mostly measures what the rules already own); the picks are not. The last Flash-Lite drive, week one, 4-day advanced hybrid: Upper = bench, bent-over row, overhead press, lateral raise, cable curl; Lower = back squat, trap-bar deadlift, leg extension, calf raise; Upper 2 = incline bench, wide pulldown, seated dumbbell press, cable lateral raise, pushdown; Lower 2 = conventional deadlift, RDL, hanging leg raise, seated calf raise. 5-day push/pull/legs: bench, OHP, lateral raise; pulldown, row, curl; back squat, RDL, leg extension, calf raise; incline bench, dumbbell shoulder press, pec deck; pull-up, chest-supported row, curls. Compare the afternoon's run 3: bent-over row opening Upper, goblet squat opening Lower, a 4 × 14–19 bodyweight squat on Friday.

**The bigger model did not help.** Gemini 3.5 Flash scored the same or lower than Flash-Lite on both drives with identical structure, and its picks were no better. That is the research finding reproduced on our own harness: the structure of the week is what the rules should own, and once they do, the pick call is easy enough for the small model. No provider work.

### Deliberately not done

- Lower 2 opened with deadlift then RDL (two hinges, no squat pattern) on the last drive: the slot-2 description asks for a squat when slot 1 is a deadlift and the model ignored it. A deterministic pairing rule (hinge opener means a squat in slot 2) is the next step if it recurs; the hinge cap already stops a third.
- The copy call's tokens are logged (`writeSessionCopy`) but not added to the capture's `meta.groq` totals.
- The client's meso hint text still mentions `programSummary`; the pick prompt no longer renders it. Harmless; rides a binary if cleaned.
- Sex is not an input anywhere (form, DTO, rules). Dylan asked; see the session answer.
- Loads: nothing is invented. A lift with no log and no typed number gets no weight; a first-week main lift gets the calibration note ("no logged history for this lift yet. Work up over 2-3 sets to one set of N with about R left in the tank, log it, and your next plan builds its loads from it"). Accessories with no history get no weight and no note.

### Fourth run, on the Tier 6 pipeline (2026-09-17, late night)

Same inputs as runs 1–3 (Build muscle, 4 days, 4 weeks, gym, 30–45 min, intermediate, 3–4 sessions a week, bring up Back, bench 135 × 8). Same rig, backend rebuilt at c1e8893. Raw capture: `docs/audits/2026-09-17-preview-rig-run-4.json`.

| | |
|---|---|
| Generation | 8 s, model-built, Upper/Lower, no console errors, no 4xx; pick call 1,950 prompt / 867 completion tokens, one retry, copy call 432 / 393 |
| Week 1 | Upper: bench @135, bent-over row, overhead press, lateral raise, cable curl. Lower: back squat, trap-bar deadlift, leg extension, crunch. Upper 2: incline bench, pull-up, seated dumbbell press, cable lateral raise, pushdown. Lower 2: conventional deadlift, leg press, hanging leg raise, leg curl, Russian twist. Five lifts on the upper days, four to five on the lower. |
| Against run 3 | Run 3 opened Upper with a bent-over row, Lower with a goblet squat, and put a 4 × 14–19 bodyweight squat on Friday, with three-lift days. Every opener is now a barbell staple, the second lower day is hinge-led, the second upper day is incline-led. |
| Profile | Reps 8–12 on the main lifts all four weeks (run 3 cut them to 5–9 by week 4). Effort 2 in reserve in weeks 1–2, 1 in weeks 3–4 (run 3 went to 1 in week 2). Bench 135 → 140 → 145 → 150 lb. Sets climb with the build (squat 5 → 6). |
| Coach check | All four weeks balanced, every big muscle on two days, no findings. Legs and Shoulders at the 22-set ceiling, Chest at the 8-set floor, Back 13.5–15. |
| Validator | First pass `over_concentrated_pattern`, retry the same, so the week shipped as best-available batch output (the rows above). The offending day is not recorded in the capture; the chunk log names only the issue. |

What this run shows that the rules do not fix yet:

1. **The priority muscle is not the biggest muscle.** Back is the "bring up" choice and lands at 13.5 sets while Shoulders sit at 22. The prompt gives Back the first accessory slot; the allocator fills bands, not the priority. A priority target above the band midpoint, and a lateral-raise ceiling, is the next rule.
2. **Week 4 Lower 1 is three rows** (squat 6 sets, trap bar, crunch): the post-progression trim dropped the leg extension and the leg curl to hold Legs at the band rather than take a set off the 6-set squat. A main lift is never trimmed by design; a coach would cap the main lift at 5 sets before dropping a second accessory.
3. The validator still fails its first pass on this week and the capture does not say why. Record the offending ids in the chunk record next.

### Runs 5–7: the three run-4 findings fixed (2026-09-17, late night)

Dylan: "fix those three and run the rig again". Same inputs and rig as runs 1–4. Raw captures: `docs/audits/2026-09-17-preview-rig-run-5.json`, `-6.json`, `-7.json`.

| # | Change | Where | Verified by |
|---|---|---|---|
| 1 | Priority muscle on a full day: when no session has spare time for another set, the allocator moves one from the biggest non-priority accessory in the same session, as long as that muscle stays inside the band. The shortlists also admit the priority muscle's rows to an accessory slot on a day that already trains it. | `weekly-volume-allocation.ts` (step 2b), `slot-shortlists.ts` (`priorityFits`) | `priority-and-trim.spec.ts`; run 5: Back 13.5 → 17 sets in weeks 1–3 |
| 1b | The peak week's duration clamp took those sets straight back (run 5, week 4: row 5 → 3, pull-up 5 → 3, Back 14.5). The clamp now takes sets from every other row before the priority muscle's. | `session-enrichment.ts` (`clampSessionWorkingSets`, `priorityMuscle` in the prefs), `week-progression.ts`, `plans.service.ts` | `priority-and-trim.spec.ts`; run 7: Back 16.5 / 16.5 / 18.5 / 18.5 across the four weeks |
| 2 | A main lift gives a set back (down to five, and down to four when dropping a row would leave three lifts) before the trim drops a second accessory row. | `weekly-volume-allocation.ts` (`MAIN_TRIM_CAP`, `MAIN_TRIM_CAP_THIN_DAY`) | `priority-and-trim.spec.ts`, `weekly-volume-allocation.spec.ts` (one test rewritten); run 7 week 4: Lower 1 keeps four rows with the squat at four sets |
| 3 | Captures name the validator's offending rows (pattern overflow, sub-muscle overflow, non-anchor opener, cross-session overlap). | `plans.service.ts` (`serializeChunkValidation`) | run 5's capture named them at once: `russian_twist` (a second core row) and `incline_dumbbell_bench_press` (not in the anchor list) |
| 3b | What the named rows led to: the lower finisher slot offers calves or a loaded carry, never a second core row, and the prompt says one core exercise a day; the incline dumbbell press is an accepted push and upper opener. | `slot-shortlists.ts` (`calves_or_carry`), `program-templates.ts`, `anchor-exercises.ts`, the pick prompt | run 6: first pass clean, 6 s |

| Run | First pass | Back (priority) by week | Week-4 Lower 1 rows | Openers |
|---|---|---|---|---|
| 4 | over_concentrated_pattern, row not named | 13.5 / 13.5 / 14.5 / 15 | 3 | bench, back squat, incline bench, deadlift |
| 5 | over_concentrated_pattern (`russian_twist`) | 17 / 17 / 18 / 14.5 | 4 | bench, back squat, flat dumbbell bench, deadlift |
| 6 | clean | 17 / 17 / 18 / 14 | 3 | bench, back squat, incline dumbbell bench, deadlift |
| 7 | over_concentrated_pattern (`farmer_carry`, a second core-pattern row next to a plank), retry clean | 16.5 / 16.5 / 18.5 / 18.5 | 4 | bench, back squat, incline dumbbell bench, deadlift |

All three runs: model-built, Upper/Lower, 6–8 s, no console errors, no 4xx, every week balanced with no coach findings, reps held at 8–12, effort 2 in reserve then 1, bench 135 → 150.

### Deliberately not done

- Run 7 week-4 Lower 2 is three rows (deadlift, leg press, leg raise): with two lower days in 30–45 minutes, Legs sit at the 22-set ceiling and the calf raise is the only row left to give once both main lifts are at four. A coach might keep the calf raise and take the leg press to two sets; the compound floor of three forbids that on purpose.
- The farmer carry counts as a core-pattern row for the validator's one-core cap, so a plank plus a carry fails the first pass. Either the carry gets its own pattern in the catalog or the cap allows a carry beside one core row.
- The bent-over row reached six sets in week 4 (five from the priority fill, times the peak multiplier). The compound ceiling is five in the allocator; the progression multiplier is not subject to it.

### Runs 8–10: the three run-7 findings, root-caused (2026-09-17, night)

Dylan: "look into those issues you found and figure out a solution." Same inputs and rig. Raw captures: `docs/audits/2026-09-17-preview-rig-run-8.json`, `-9.json`, `-10.json`.

**What the three findings had in common.** Every one traced back to the Legs band. The catalog has one "Legs" group for quads, hamstrings, glutes and calves, and the coach band (8–22 sets for an intermediate) is a per-muscle number. Two lower days with four lifts each at their floor sets already read as 22 weighted sets, so week 1 was allocated straight to the ceiling with nowhere to grow, the peak week's multiplier pushed it over, and the trim cut rows back out (the three-row lower day). The other two were small and separate.

| # | Finding | Root cause | Change | Where | Verified by |
|---|---|---|---|---|---|
| A | Week-4 Lower 2 at three rows | Legs ceiling too tight for a four-muscle group; week 1 allocated to it; the peak overflowed | `groupBandMax`: Legs = 1.5 × the band (33 for an intermediate). The allocation works toward ceiling ÷ the block's peak multiplier so the peak week lands on the ceiling, and it only ever takes sets (down to the floors, main lift to four); only the post-progression trim may drop a row. The coach report carries each group's own `bandMax`; the preview's bars use it when present. | `coach-check.ts` (`LEGS_BAND_SCALE`, `groupBandMax`, `MuscleVolume.bandMax`), `weekly-volume-allocation.ts` (`peakVolumeMultiplier`, `bandMaxFor`, `allowDrop`), `plans.service.ts`, `frontend/src/types/plan.ts`, `PlanPreviewScreen.tsx` (`coachBars`) | `block-headroom.spec.ts`; run 10: Legs 26 → 26 → 28 → 30.5, five-row lower days all block, no Legs trim |
| B | A row reached six sets | The peak multiplier ran after the allocator's five-set compound ceiling | Progressed sets stop at the role ceiling (main 6, compound 5, isolation and core 4) when the catalog knows the row | `week-progression.ts` (`PROGRESSED_SET_CEILING`) | `block-headroom.spec.ts`; run 10 week 4: row 5, pulldown 5 |
| C | Farmer carry plus plank failed the one-core cap | The catalog tags a loaded carry as Core | A row with the Carry pattern is neither a core row nor a pattern row for the budget | `generated-chunk-validators.ts` | `block-headroom.spec.ts`; runs 9 and 10: first pass clean |

Run 8 was the wrong first cut and is kept for the record: the headroom ceiling alone (22 ÷ 1.24 = 17) sent the allocation-time trim through its drop rule and left two- and three-row days in week 1. Run 9 stopped the drops but Legs still sat at 22 from fractional credit (planks and leg raises count half toward Legs), so the trim after progression fired in every week. Run 10 is the fix above.

| Run | First pass | Legs by week | Lower rows wk 1 → wk 4 | Row (priority) wk 4 |
|---|---|---|---|---|
| 7 | carry flagged, retry clean | 22 / 22 / 20.5 / 21 | 4, 4 → 4, 3 | 6 sets |
| 8 | clean | 17 / 17 / 19.5 / 21 | 2, 3 → 2, 3 | 5 |
| 9 | clean | 22 / 22 / 22 / 20.5 | 4, 4 → 4, 3 | 5 |
| 10 | clean | 26 / 26 / 28 / 30.5 | 5, 5 → 5, 5 | 5 |

All three: model-built, 6 s, no console errors, no 4xx, every week balanced, reps held, bench 135 → 150. Backend and frontend type-check; 406 backend tests green (coach-check spec now matches per-muscle objects loosely, three allocation fixtures rewritten for the 33-set Legs ceiling).

### Deliberately not done

- Shoulders still sit at 21.5 in week 1 from fractional credit (every press and pull adds half a set), so the peak week drops a lateral raise on Monday. The same accounting question as Legs, one size down; not changed tonight.
- The client's bar change (per-group ceiling) rides the next binary; old clients draw Legs against 22 and will show it "over" once the plan grows past that.
- The coach report's `band` stays the per-muscle band; the sheet's "Aim 8–22 a week" line does not mention that Legs is wider.
