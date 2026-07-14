# Future ideas

## Plan-generation follow-ups (from the retired issues doc)

The full audit lived in `docs/plan-generation-issues.md` (removed 2026-07-08 once
the P0 + frontend work shipped in PR #6; full write-up in git history at
`ccbe90d`). Still open, in priority order:

### Workout-quality passes (ship as one backend PR)

1. **Per-session movement-pattern cap.** *Done 2026-07-14 (round 7):*
   `capRedundantMovementFamilies` now caps total presses per session (3 on
   upper days, 2 elsewhere; press-focused titles exempt), runs the
   squat/hinge/lunge dominance caps on every strength day, and a replacement
   can no longer land in a sibling family already at cap. Machine/floor
   chest presses now count as presses.
2. **Intra-session push/pull balance.** Partially covered by round 7: the
   press-total cap prefers a pull as the swap-in, so 4-press upper days now
   ship 3-press : 2-pull. A true ratio pass (insert pulls when under-pulled,
   not just cap presses) is still open (`generation-chunk-repair.ts`).
3. **Intra-plan volume undulation.** Sessions sharing a duration all get the
   same working-set cap → no heavy/light variation across a week. Vary
   `workingSetCap` by `isHardDay`. *Decision 2026-07-08: skipped on purpose —
   periodization polish beta users won't perceive; revisit post-launch if ever.*
4. **Ordering without a tier-0 anchor.** Days with no true Squat/Hinge/Push
   anchor sort accessories first. Fall back to the highest-tier available
   movement as the anchor.

Constraints: deterministic server-side passes only (zero new Groq calls), keep
`backend npm test` + `plans/eval/` green, add an eval invariant per new rule.

### Generation quality — good enough for now, keep fine-tuning (2026-07-08)

Two rounds of deterministic fixes landed 2026-07-08 (cardio-repeat validator
exemption, base-movement near-dup repair, post-enrichment dedupe, fully
templated cardio days, finisher modality conformance). A third round landed
2026-07-09 after a coach-level review of the newest captures: core/cardio
movement patterns no longer masquerade as 'Push' (fixes warm-up tie-in picking
sit-ups as the main lift), anchor lists are compounds-only with home-capable
options and the slot-1 swap respects equipment, the pull-balance insert must
be an actual pull, deterministic notes use coach language (no snake_case ids
or pipeline jargon in user copy), rep ranges snap to canonical coach bands,
generation pools filter on required equipment (alternatives no longer smuggle
cable moves into home plans; swimming needs a pool), and the scorer gained
equipmentConformance + copySanity dimensions (ceiling 124 → 140 — re-baseline
mean totals when comparing to older reports).

A fourth round landed 2026-07-10 after a live re-verify (fresh captures scored
136-140/140, one perfect score): the warm-up ramp line now targets the actual
slot-1 lift (and is omitted for bodyweight/timed openers), the cardio-day
template checks equipment (home run days resolve to new outdoor jog/run
catalog rows; swim without a pool falls back to zone 2), a post-LLM equipment
gate swaps or drops any generated row whose required gear the user lacks
(pinch_block unmapped from 'Bodyweight'), and strength-session reasoning is
rebuilt deterministically from the final exercise list, ending garbled or
contradictory model copy.

A fifth round landed 2026-07-10 evening: week-level pattern floors (every
week's strength sessions must cover knee, hinge, horizontal + vertical push,
horizontal + vertical pull — `week-pattern-floors.ts`, floor pools target the
missing pattern), the common-exercise list grew 36 → ~90 staples with a new
niche tier sorted last (the alphabetical tiebreak was why Bear Row-class picks
kept appearing), gym-speak search aliases (Skullcrusher, OHP, Triceps
Pushdown) plus five missing barbell staples (box/pause/overhead squat,
thruster, clean & jerk), and tire unmapped from 'Bodyweight' (live Tire Flip
in a dumbbell/band gym).

A sixth round landed 2026-07-13: multi-week programs work end to end. The
design (week 1 via Groq, weeks 2+ cloned with `weekProgression` applied) was
being destroyed by two program-wide passes — the merged chunk repair treated
intentional week clones as duplicates and swapped them into niche picks, and
enrichment's rep-band stamping erased the progression math, so a 4-week plan
shipped as drifting exercises at flat intensity with no deload. Duplicate
checks (repair + validator + same-focus opener diversity) are now scoped per
`weekIndex` group, the clone copies rows verbatim, and week targets land in a
final post-enrichment pass (`week-progression.ts`) that also stamps a deload
note on deload sessions. Live 4-week drives: cloned weeks with 4x5 → 5x4 →
5x3 → 3x7 openers and all-week deload notes, scored 139/140.

A seventh round landed 2026-07-14 after a gym-only review pass (fresh drives
scored 134-136/140): per-session press-total cap + everywhere dominance caps
(item 1 above), and three week-progression guardrails — volume weeks re-clamp
to the duration-derived working-set cap (peak weeks now land ~21 sets inside a
60-min slot instead of ~65 min), progressed sets floor at 2 (a x0.7 deload on
a 2-set accessory shipped a single working set), and negative rep modifiers
skip bodyweight/unilateral/isolation rows (a beginner peak week shipped 4x4
Bulgarian split squats and 3x4 bodyweight glute bridges).

Watch list for the next tuning pass:
- **Cardio-day core picks across cloned weeks.** *Resolved 2026-07-14 by the
  week-scoped enrichment exclude list:* cardio days now resolve identically
  across cloned weeks (live: Front Plank + Side Plank every Saturday of a
  4-week plan), so the escalating near-dup pairs (Ab Wheel → Kneeling →
  Standing across weeks) no longer occur. A bad week-1 pick now repeats
  weekly — covered by the skill-gating item below.
- **Below-min backfill counts cardio rows.** Groq returned lower days with 4
  lifts + 2 cardio rows; the chunk backfill saw 6 rows (no fire), enrichment
  collapsed the extra cardio, and 5-row sessions shipped — cloned to every
  week in a multi-week plan (one live 4-week drive capped at 63/140 for this
  alone). Count only non-cardio rows toward `minExercises`, or backfill after
  enrichment.
- **Cross-week opener drift.** *Fixed 2026-07-14:* the root cause was
  `enrichGeneratedSessionsInChunkOrder` building its cross-session exclude
  list program-wide, which depleted the anchor/swap pools week by week (live
  worst case: week 3's peak Lower day opened with Hanging Knee Raise 4x10
  after the anchor swap found nothing left). The exclude list is now scoped
  per `weekIndex`; three fresh 4-week drives kept every weekday's opener
  stable across all four weeks. The program-wide `runNearDuplicatePass`
  replacement excludes (generation-chunk-repair.ts) could in principle still
  drift an accessory when a within-session near-dup survives to the clone —
  not observed since; check captures before spending here.
- **Isolation guard misses odd names.** The week-progression rep-band guard
  keys on `ISOLATION_NAME` + catalog `type: 'Isolation'`; a live Pull day
  still shipped Tate Press at 2x4 in a beginner peak week (name unmatched,
  catalog type not Isolation). Extend the regex or fix the catalog row.
- **Beginner anchor skill gate (new example).** A live beginner Push day
  opened with Single-Arm Dumbbell Push Press 5x5 — same class as the Kroc
  Row opener; the skill-gating item below now has three live examples.
- **Multi-week scorer findings repeat per cloned week.** Session-level
  findings (ordering inversions etc.) now print once per week for the same
  cloned session; dedupe or group them by week in the report.

- **Rule-based fallback day purity.** When Groq is rate-limited the fallback
  generator can open a Pull day with a bench dip (a push); enrichment fixes
  balance but not the mismatched opener. Give the fallback the same
  title-pattern filter the pools use.
- **Advanced gym users should not get a bodyweight opener.** A live hybrid
  plan led an upper day with 4×5 Push-Ups; slot-1/anchor logic could prefer a
  loaded staple when experience is advanced and equipment allows.
- **Repetitive finishers.** Three of four gym days closed with the same
  Treadmill Walk; rotate within the modality family.
- **Stale interval notes on re-timed cardio rows.** The scrub only matches "N
  seconds/minutes of work"; live rows still shipped "30 seconds brisk pace" on
  a 10-minute block. Widen the contradiction check (any note claiming a
  duration that disagrees with `durationSeconds`).
- **Nonsense short time prescriptions.** Timed carries/holds ship with
  rep-style numbers (3×8 = 8 seconds). Enforce a sane floor (~20 s) or convert
  to reps; prescriptionHygiene has a max cap but no minimum.
- **Position-variant redundancy.** `baseMovementKey` deliberately keeps
  position words, so seated + standing OHP can share a session. Decide whether
  press variants deserve a stricter rule (live: Overhead Carry + Overhead Hold
  as the two core rows of one cardio day).
- **Leg-day muscle stacking + ordering.** The remaining eval findings are
  pairwise order inversions (leg press ranked ahead of front squat) and
  "stacks 4-5 consecutive Legs lifts" on lower days — partly scorer
  over-strictness on single-region days, partly real ordering polish.
- **Bench not modeled as equipment.** Home plans can prescribe Flat Dumbbell
  Bench Press (floor press is the coach-true substitute). `SETUP_EQUIPMENT_IDS`
  deliberately never gates benches; decide whether home should.
- **Conditioning coverage.** Weakest eval dimension (~72% of ceiling across
  historical captures): not every strength day gets a finisher on hybrid/fat
  loss goals. Check whether `shouldAppendHybridCardioFinisher` is too shy.
- **Recovery days** still pass through enrichment untouched (cardio days are
  templated now; recovery could get the same treatment).
- **Catalog cleaning over bulk adds** (1294 rows, 151 equipment ids): ~12
  grip-sport specialty rows (axle bar, blobs, grippers) still reach plans via
  "map to available" equipment entries (axle_bar → Barbell); tag or unmap
  them, and standardize display-name qualifiers on parentheses (catalog still
  has em-dash names like "Swimming — Easy Laps").
- Re-score periodically with `npm run eval:captures:report` (backend) after
  generating with `GENERATION_CAPTURE=1` — validator-ok rate and mean total
  are the regression signals.

### Home / beginner plan quality (deferred 2026-07-08, live-drive findings)

A beginner · home · fat-loss test generation exposed gaps that don't block the
gym-focused beta but need fixing before promoting home plans:

1. **Experience/skill gating.** No filter stops beginner plans from getting
   pull-ups, jump-rope double-unders, or plyo box jumps. Tag high-skill /
   high-impact catalog rows and gate or substitute by `experienceLevel` — in
   generator candidates AND enrichment swap pools (enrichment swapped
   `goblet_squat` → `back_squat` for a home beginner).
2. **Week-level pattern floor.** Balance checks only fire on Upper/Lower
   titles, so a "Full Body" day with zero lower-body work passes validators
   (observed live). Require ≥1 lower-body movement on full-body days and ≥1
   Squat + ≥1 Hinge somewhere in each week.
3. **Home equipment realism.** *Largely fixed 2026-07-09:* generation pools
   and the slot-1 anchor swap now filter on required-only equipment
   (`primaryEquipment`), so barbell/cable moves no longer reach home plans via
   equipment alternatives. Remaining: the LLM itself can still propose
   off-equipment moves that enrichment keeps when no repair pass touches the
   row — the new `equipmentConformance` eval dimension surfaces these.
4. **Single-session regen modalities.** `GenerateSingleSessionDto` has no
   `cardioModalities`, so a regenerated cardio day falls back to the generic
   zone-2 template instead of the user's preferred modality. Plumb it through
   like the plan flow.

### Reliability

- **401 refresh race → sign-out.** Home and Plan fire concurrent requests on
  app open; if both 401 and refresh coordination fails, the client signs the
  user out (`api/client.ts`). Verify supabase-js dedupes concurrent
  `refreshSession()` calls; only sign out on a *definitive* invalid-refresh-token
  error.
- **Apply atomicity (mild).** `create()` commits the plan row, then
  materializes workouts outside any transaction (`plans.service.ts`); a failure
  mid-materialization leaves orphan rows and a 500 after the plan exists. Wrap
  in a transaction or make `create` idempotent when convenient.
- **`findWeekly` / `isActive` alignment.** `findWeekly` picks the plan by
  `updatedAt` only (`workouts.service.ts`), while plans endpoints prefer
  `isActive`. They agree today, but any feature touching an inactive plan's
  `updatedAt` desyncs the Workout tab. Align `findWeekly` on `isActive`-first.
- **Timeout copy.** Confirm with capture logs whether 150s preview timeouts
  still happen before spending here.

### Catalog data

- **Deadlift muscle-group home.** Conventional Deadlift is filed under Legs,
  Sumo under Back — labels, colors, body-map tiles, and filters all surface the
  inconsistency. Pick one home (recommend Legs) and re-tag.
- **`subMuscles` backfill.** Exercises without sub-muscle data fall back to
  whole-group body-map highlights and are invisible to sub-muscle filter chips.
  Audit popular exercises and backfill.

## Optional logging without full workout flow

Some users may want planned workouts **visible** (Plan / Workout preview) without running the live session (sets, finish screen, `saveWorkoutLog`). Today, **History** only reflects in-app completed sessions.

**Later:** consider a lightweight path—e.g. “Mark done” / quick log for sessions completed elsewhere, or manual duration-only entry—so History can reflect reality without forcing the full flow.

## Add a lift that isn't in the DB

**Later:** log movements without a canonical `exerciseId` (e.g. free-text name, optional library match, or stub) and define how **History** shows them.

## Make sure history also stores reps/sets, etc...

## Server-side user preferences (multi-device / reinstall restore)

Onboarding selections (goal, experience, equipment, training days, injury tags/notes, display name, avatar, `hasCompletedOnboarding`) are persisted **locally only** — per-user in AsyncStorage under `jim_user_preferences_v1:<userId>` (`frontend/src/contexts/UserPreferencesContext.tsx`). Cross-account leakage on a shared device is fixed (per-user keying + reset on sign-out), but there is **no server-side store**, so an existing user who logs in on a new phone or after reinstalling lands with empty prefs → `hasCompletedOnboarding=false` → forced to re-onboard, and prior preferences are lost.

**Later:** add a per-user preferences/profile endpoint on the backend, write prefs on change, and load them on login (merging with local). This is the only option that survives reinstall / new device and truly links the data to the account. Until then, preferences are device-local by design.

Caveat to address alongside this: injury notes (free-text health info) currently sit in plaintext AsyncStorage, not SecureStore — fine for in-app cross-account isolation, but readable at rest on a compromised/rooted device.

## Single-workout "Regenerate with AI" should match full plan scope

`regenerateWorkout` (`backend/src/workouts/workouts.service.ts`) only passes `focus`,
`programDayFocus`, `duration`, and `excludeExerciseIds` to the generator. The focus is now
derived from the day title (fixed: push days no longer come back as full-body — see
`regenerate-focus.util.ts`), but regen still **drops every other constraint** the
generate-plan page sends (`buildGenerateSessionsRequest` in `frontend/src/lib/planPipeline.ts`):

| Constraint | Plan applies | Regen does | Result |
| --- | --- | --- | --- |
| Equipment | filters to `equipmentTags` | none → `equipment: []` → no filter | Home/no-barbell user can get barbell & machine lifts |
| Injuries / limitations | `avoidConstraints` + `restrictions` filter exercises | none | Can reintroduce moves an injury excluded ⚠️ safety |
| Goal | e.g. `strength` | defaults to `hypertrophy` | Sets/reps drift off goal |
| Experience | e.g. `beginner` | defaults to `intermediate` | Exercise count + beginner notes differ |

Root constraint: none of these inputs are persisted server-side (`WorkoutPlan` has no
inputs columns, `User` has no profile row). They live only in frontend
`UserPreferencesContext` (goal, experience, equipment, `injuryTagIds`, `injuryNotes`).

**Later (two options):**
1. **Frontend sends current prefs on regen (preferred, no migration).** Extend the regen
   request body with `equipment`, `goal`, `experience`, and injuries (mapped the same way
   the plan page does), merge them into the generate DTO backend-side. Touch points: regen
   DTO/controller, `regenerateWorkoutInPlace` in `frontend/src/services/workoutService.ts`,
   + a test. Uses *current* prefs (acceptable for a single-workout regen).
2. **Persist the plan's original inputs** (JSON column captured at plan creation) and have
   regen read them — most faithful to "the plan as generated," needs a schema migration.
   Pairs naturally with the [Server-side user preferences] item above.

Do one on-device test covering focus **and** scope together once this lands.
