# Exercise catalog audit — findings

Accumulating findings report for the audit defined in
`docs/plans/2026-08-06-exercise-catalog-audit.md`. One section per task from
the Section 0.5 checklist. **Nothing in this report is applied until Dylan
approves it**; application happens later in eval-gated slices (plan §7).

---

## Task 0 — Automated integrity sweep (2026-08-07)

**Method.** Throwaway Node scripts (scratchpad, not committed) over
`backend/data/exercises_5000plus.json` (1,299 rows), validating against the
compiled backend maps (`exercise-mappings`, `movement-pattern-fillins`,
`exercise-prescription`, `common-exercise-ids`, `anchor-exercises`,
`plan-templates`) and the compiled frontend prescription twin
(`frontend/src/lib/exercisePrescription.ts`). All seven plan §2 check
categories ran. Guard specs: `npx jest src/data src/exercises` — 12 suites,
192 tests, all green on the current tree.

**Clean checks — no findings.** Unique ids; snake_case id format; every
`subMuscleId` and `movementPatternId` resolves; sub-muscle prefixes all match
their primary group; no secondary list contains its primary; no duplicate
values inside any array field; no whitespace/casing lint; every description
present; `type` / `difficulty` / `isUnilateral` fully enum-conformant; 16
position values as expected; zero orphaned references from common tiers,
anchors, plan templates (names match verbatim too), or the cardio
gating/ordering files. Rows with empty `subMuscleIds` = exactly the 50 cardio
rows (looks by-design; Task 11 confirms).

### 0.1 Cross-group duplicate pairs — the headline finding

**14 duplicate pairs (28 rows). In every single pair the two twins sit in
different primary muscle groups.** The original model evidently generated
each muscle group's batch independently, so the same movement was created
once per plausible group with a different id. Six pairs even share the exact
display name, so search shows two identical entries; and logged history
fragments across whichever id a plan happened to use.

**Retiring one twin implicitly decides the movement's muscle-group home** —
this includes the "Deadlift home" decision from plan §4. Dylan's standing
lean is Legs for the deadlifts, which matches keeping the legs-side twin.

| Keep (proposed) | Retire (proposed) | Groups (keep/retire) | Referenced by | Session |
| --- | --- | --- | --- | --- |
| `conventional_deadlift` ⚠T/A/C | `deadlift_conventional` | legs / back | keeper: templates, anchors, common | Legs B |
| `barbell_romanian_deadlift` ⚠T/C | `romanian_deadlift` ⚠C | legs / back | **both in common tier**; keeper in templates | Legs B |
| `barbell_sumo_deadlift` **or** `sumo_deadlift` ⚠A/C | the other | legs / back | **back-side twin holds the anchor/common refs** — keeping legs requires re-pointing them. Decision needed | Legs B |
| `barbell_good_morning` | `good_morning` ⚠C | legs / back | retire-side in common tier — re-point | Legs B |
| `seated_good_morning` | `barbell_good_morning_seated` | legs / back | none | Legs B |
| `dumbbell_single_leg_romanian_deadlift` | `single_leg_rdl` | legs / back | none | Legs B |
| `barbell_hip_thrust` ⚠T/C | `barbell_hip_thrust_back_ext` | legs / back | keeper: templates, common | Legs B |
| `band_pull_apart` | `scapular_retraction_band` | shoulders / back | none | Shoulders |
| `single_arm_cable_face_pull` | `cable_face_pull_single_arm` | shoulders / back | none | Shoulders |
| `resistance_band_face_pull` **or** `band_face_pull` | the other | shoulders / back | none — also decides face-pull home | Shoulders |
| `dumbbell_pullover` | `pullover_dumbbell` | chest / back | none — classic chest-vs-lats call | Chest |
| `farmer_carry` ⚠T | `dumbbell_farmer_carry` | core / arms | keeper: templates | Arms B + Core |
| `bottoms_up_carry` **or** `bottoms_up_kettlebell_carry` | the other | core / arms | none | Arms B + Core |
| `bottoms_up_hold` **or** `kettlebell_bottoms_up_hold` | the other | core / arms | none | Arms B + Core |

(⚠T = plan templates, A = anchor pools, C = common tier. "Retire" = unmap
per the `cardio-catalog-exclusions.ts` precedent — ids are never deleted.)

Severity: **data-corrupting** (history attribution splits across ids;
generation can pick both twins in one plan, defeating diversity checks) +
user-visible (duplicate search results). Final keep/retire calls belong to
the owning sessions; the sumo and face-pull rows need Dylan's group-home
decision either way.

### 0.2 `glutes` secondary muscle silently dropped (81 rows)

81 rows list `glutes` in `secondaryMuscleGroupIds`. That id is not in
`PRIMARY_MUSCLE_GROUP_MAP` (canonical: chest/back/legs/shoulders/arms/core/
cardio), so `transformExercise` silently filters it out — the glute credit
never reaches previews, filters, or balance logic. All 81 rows have
`primaryMuscleGroupId: legs` already, so the fix is NOT "map glutes→legs"
(self-referential); proposed disposition: delete the invalid entry and let
`legs_glutes` in `subMuscleIds` carry the emphasis (spot-check during the
Legs sessions that it's actually present on those rows).
Severity: user-visible. Sessions: Legs A/B/C (or one approved mechanical
slice).

### 0.3 Unknown equipment ids (8 ids, 33 references, 27 rows)

Three distinct classes:

| Class | Ids | Rows | Disposition path |
| --- | --- | --- | --- |
| Grip-sport specialty (the plan §4 backlog class) | `hammer` (10 rows), `pinch_block` (14 rows) | hammer levers, pinch blocks, blob/hub lifts, rolling handles | Arms B retire review. Note: 11 of the `pinch_block` refs are in `equipmentAlternativeIds`, the same alternatives channel the axle-bar leak used |
| Real gym machines missing from `EQUIPMENT_MAP` | `iso_lateral_curl_machine` (2), `seated_dip_machine` (3), `rotary_torso_machine` (1) | curl/dip/torso machine rows | Decide: retag to existing equipment ids vs add display-map entries (backend-only). Unmapped required gear currently renders the row Unmodeled → unavailable under any equipment filter |
| Deliberately unmodeled (pool precedent) | `tire` (1), `pool` (1), `bicycle` (1) | Tire Flip, Swimming Laps, Outdoor Cycling | Confirm intended — matches the documented `UNMODELED_EQUIPMENT` sentinel design |

Severity: user-visible (rows unavailable/undisplayable) with one
gating-correctness thread (alternatives). Sessions: Arms B, plus the machine
rows' owning groups.

### 0.4 Rep exercises served as *timed* via alias regex (5 rows)

`inferPrescriptionTypeFromRawExercise` scans aliases with the time regexes;
five rows have an alias that trips them, so the API serves
`prescriptionType: "time"` for what are (mostly) rep exercises — users see a
duration where a rep target belongs, live today:

| id | Name | Offending alias | Assessment |
| --- | --- | --- | --- |
| `svend_press` | Svend Press | "Plate **Pinch** Press" → carry regex | wrong — rep press |
| `pike_pullup` | Pike Pull-Up | "**L-Sit** Pull-Up" | wrong — rep pull (alias itself dubious) |
| `active_hang_scapular_pull` | Scapular Pull-Up | "Active **Hang**" | wrong — rep scap pulls (id↔name drift too) |
| `hanging_lat_shrug` | Hanging Lat Shrug | "**Dead Hang** Lat Depression" | wrong — rep shrugs |
| `plank_dumbbell_drag` | Plank Dumbbell Drag | "**Plank** Pull-Through" | ambiguous — name path deliberately excludes plank+drag; alias re-includes it |

Proposed: set explicit `prescriptionType: "reps"` on the clear four
(explicit beats inference — catalog-only fix, no regex-twin edits), and
judge `plank_dumbbell_drag` in the Core session. Related, lower severity:
`rope_hang` is correctly timed by the backend (movement pattern `hang`) but
the frontend name-fallback would show reps — harmless while the API sends
`prescriptionType`, noted as a known twin asymmetry (frontend can't see
patterns/aliases). Severity: user-visible.

### 0.5 The only video mapping is dead (1)

`backend/data/exercise-videos.json` has exactly one entry, keyed
`bench_press_barbell_flat` — an id that does not exist. The catalog id is
`flat_barbell_bench_press`. The demo-video feature currently ships zero
working videos. Proposed: rekey (a one-line fix; still out of audit scope to
*expand* the video set). Severity: user-visible.

### 0.6 Alternatives overlapping required equipment (4 rows)

`assisted_parallel_bar_dip` (parallel_bars), `feet_elevated_bench_dip`
(bench), `landmine_upright_row` (barbell),
`single_arm_foam_roller_serratus_wall_slide` (wall) each repeat a required
id in `equipmentAlternativeIds`. Mechanical cleanup: drop from alternatives.
Severity: cosmetic.

### 0.7 Em-dash display names (11 rows, all cardio)

"Jump Rope — Single Unders", "Swimming — Easy Laps", "HIIT — General
High-Intensity Intervals", etc. Known standardization class (plan §4):
convert qualifiers to parentheses. Session: Cardio (Task 11), naming slice.
Severity: cosmetic.

### 0.8 Overlong instructions (2 rows)

`hiit_high_intensity_interval_session` (6 steps),
`zone_2_training_session` (7 steps) exceed the 3–5 schema. Session: Cardio.
Severity: cosmetic.

### Counts summary

| Check | Findings |
| --- | --- |
| Cross-group duplicate pairs | 14 pairs / 28 rows |
| Invalid `glutes` secondary | 81 rows |
| Unknown equipment ids | 8 ids / 27 rows |
| Alias-driven wrong timed verdicts | 5 rows (+1 FE-only gap) |
| Orphaned video mapping | 1 (of 1 total) |
| Alt∩required equipment | 4 rows |
| Em-dash names | 11 rows |
| Overlong instructions | 2 rows |
| Exact-name duplicates (subset of pairs) | 6 |
| Name-family collisions (mostly intended equipment variants) | 163 families |
| Explicit `prescriptionType` rows (info) | 5, all correct |

### Appendix A — id↔name semantic drift (39 rows, Phase-2 prefilter)

Mechanical token-diff between id and display name where the difference is a
meaningful qualifier (equipment/angle/grip word). Mostly cosmetic id-naming
inconsistency (ids are immutable — the *name* is what a session would fix if
the name is the wrong side). Heavy cluster in Back A (lat pulldown/row
rows). Non-Back rows routed to their groups.

`single_leg_rdl` (romanian) · `cable_high_row_elbows_wide` (wide) ·
`dumbbell_chest_supported_row_flat` (dumbbell) · `high_pull` (barbell) ·
`cable_row_unilateral_kneeling` (single,arm) · `barbell_good_morning_seated`
(barbell) · `seated_row_overhand` (cable) · `seated_good_morning_band`
(seated,band) · `banded_row_seated` (band) · `single_arm_smith_row`
(machine) · `incline_row_cable_unilateral` (single,arm) ·
`wide_grip_seated_cable_row_single` (cable,arm) · `seated_row_torso_rotation`
(seated,cable) · `lat_pulldown_supinated` (reverse) ·
`lat_focused_seated_row_narrow` (cable) · `lat_stretch_pulldown_single_arm`
(overhead,cable) · `banded_pulldown_standing` (standing,band) ·
`cable_lat_pulldown_d_handle` (cable) · `jm_row_pulldown_hybrid`
(single,arm,cable) · `stir_the_pot_lat` (cable) ·
`seated_cable_lat_pulldown_incline` (seated) · `wide_grip_lat_pulldown_front`
(front) · `cable_undulating_pulldown` (alternating) ·
`cable_pulldown_standing_split` (standing) · `decline_bench_lat_pulldown`
(cable) · `db_lat_swing` (dumbbell) · `slam_ball_lat_activation` (overhead) ·
`single_arm_lat_stretch_cable` (overhead) · `wall_lat_stretch_active`
(assisted) · `crossover_lat_pulldown` (cable) · `bar_pulldown_seated_hammer`
(seated) · `barbell_behind_neck_pull_up` (assisted) ·
`half_kneeling_lat_pulldown_cable` (cable) · `one_arm_dumbbell_row_lat_bias`
(dumbbell) · `cable_single_arm_pulldown_behind` (cable,neck) ·
`cable_pulldown_lying_face_up` (cable) · `stair_climber_machine` (machine) ·
`jacobs_ladder_machine` (machine) · `versaclimber_machine` (machine)

### Appendix B — timed-looking names inferred as reps (28, Phase-2 prefilter)

Sit-up family (12 rows) is correctly reps — regex noise. The walk/march
family needs Phase-2 judgment (often programmed for time/distance): Toe
Walk, Weighted Toe Walk, Lateral Band Walk, X-Band Walk, Monster Walk,
Tabletop March, Waiter March, Pallof Press March, Bottoms-Up March, Zercher
March, Front Rack March, Overhead March, Towel Flexed-Arm Hang, Bear Plank
Dumbbell Drag, Side Plank Reach-Through, Side Plank Row.

### Appendix C — cardio display depends solely on the group tag (29 rows)

29 cardio rows (Burpee, Box Jump, Battle Rope waves, HIIT/EMOM/AMRAP
sessions, …) would render as reps in any frontend fallback path that lacks
`primaryMuscleGroup`. Informational — the API sends `prescriptionType`, and
the belt-and-suspenders group check covers the rest. No action; re-check if
a new render path ever bypasses the service layer.
