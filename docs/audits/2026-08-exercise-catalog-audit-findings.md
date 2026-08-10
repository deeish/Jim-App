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

---

## Task 1 — Chest (2026-08-07)

> **APPLIED 2026-08-07** (commit `3be3d41`, Dylan approved applying the
> chest package directly): all §1.2 metadata corrections, the Task-0 video
> rekey, and an add list EXPANDED from the 7 drafts below to **15 rows**
> (48 → 63 chest) — the drafts plus One-Arm Push-Up, Dive Bomber Push-Up,
> Weighted Push-Up, Band-Resisted Push-Up, Deficit Push-Up, Wide-Grip
> Bench Press, Dumbbell Floor Fly, and Single-Arm Kettlebell Floor Press
> (all verified missing, existing ids only, both regex twins infer reps,
> gating smoke-tested). Gates: integrity sweep clean, 49/49 backend suites
> (588 tests), eval:captures:report byte-identical before/after.
> **Still pending:** the `cable_pullover` retire (§1.1 — waits on decision
> 1.3-A and the retire mechanism slice) and decisions 1.3 A–D.

**Scope.** All 48 `primaryMuscleGroupId: chest` rows, judged row-by-row
against the plan §3 criteria. Valid chest subs: `chest_upper`, `chest_mid`,
`chest_lower`.

**Verdict: the healthiest slice we could have hoped for.** Every row is a
real, sensible exercise; equipment gating is honest; difficulty grades are
sane (Archer Push-Up and Weighted Dip correctly Advanced, dips correctly
Intermediate); the tricky incline/decline push-up inversion (hands-elevated
= *lower* chest, feet-elevated = *upper*) is tagged **correctly** on all
counts; descriptions and instructions are clean imperative copy. The
problems are: chest is badly under-covered (48 rows vs 300 for arms —
add-heavy list below), the pullover family is fragmented across groups, and
one equipment-mapping design issue affects the dip/ring rows.

### 1.1 Retire candidates (1 firm, 1 pending decision 1.3-A)

| Row | Reason | Mechanism |
| --- | --- | --- |
| `cable_pullover` ("Cable Pullover", chest) | Same movement as back's `straight_arm_cable_pulldown` ("Straight-Arm Cable Pulldown") — a standing straight-arm cable pull; the chest row even aliases itself "Straight-Arm Cable Pullover". Family key misses it (pullover ≠ pulldown), so both can appear in one plan. Keep the back row (canonical gym name). | Exclusion list per `cardio-catalog-exclusions.ts` precedent |
| `pullover_dumbbell` (back twin of `dumbbell_pullover`) | Task 0 pair 0.1 — resolved by decision 1.3-A below | same |

### 1.2 Metadata corrections proposed

| Id | Field | Current → proposed | Why | Severity |
| --- | --- | --- | --- | --- |
| `svend_press` | `prescriptionType` | (absent) → `"reps"` explicit | Task 0 §0.4 — alias "Plate Pinch Press" trips the carry regex; served as timed today | user-visible |
| `chest_dip` | `aliases` | drop "Parallel Bar Dip" | Exactly collides with arms' `parallel_bar_dip` row name (upright triceps dip — a genuinely distinct exercise); search surfaces both as the same thing | user-visible |
| `dumbbell_pullover`, `barbell_pullover` | `secondaryMuscleGroupIds` | `[shoulders]` → `[back, shoulders]` | Lats are a primary mover in any pullover — missing credit regardless of decision 1.3-A | user-visible |
| `machine_chest_press` | `aliases` | + "Hammer Strength Chest Press", "Plate-Loaded Chest Press", "Iso-Lateral Chest Press" | Plate-loaded stations are what many gym users search for; cheaper than a new row | cosmetic |
| `incline_machine_chest_press` | `aliases` | + "Hammer Strength Incline Press" | same | cosmetic |
| `floor_press` | `equipmentAlternativeIds` | drop `dumbbells` | Dedicated `dumbbell_floor_press` row exists; the alt only muddies browse display and the alternatives channel (axle-bar-leak class) | cosmetic |
| `mid_cable_fly` | `secondaryMuscleGroupIds` | `[]` → `[shoulders]` | Every sibling fly lists shoulders; front delts genuinely assist | cosmetic |
| `ring_push_up` | `instructions[3]` | palm-rotation cue is inverted (says turn out at bottom / in at top; standard is rings turned out at top lockout) | copy accuracy | cosmetic |

Not proposed (adversarially self-rejected): retagging `landmine_press`
rows' difficulty or subs (45° press → `chest_upper` is defensible);
"fixing" `bodyweight_chest_fly` to Advanced (from-knees regression keeps it
Intermediate — added to the skill watch list instead); position-value
cleanups (`incline_push_up`: Standing, `chest_dip`: Standing vs Supported)
— display-only metadata, churn not worth it, noted for a future position
audit if the field ever becomes functional.

### 1.3 Decisions needed from Dylan

**A. Pullover home (resolves Task 0 pair + family fragmentation).** The
pullover family lives in three groups today: chest holds `dumbbell_pullover`
/ `barbell_pullover` / `cable_pullover`; back holds NINE pullover rows
(`pullover_dumbbell`, `ez_bar_pullover`, `incline_dumbbell_pullover`,
`machine_pullover_nautilus`, `straight_arm_cable_pulldown`, …); arms holds
the PJR pullover-extension family (correct — those are triceps moves).
Recommendation: **home = back** (lats dominate; matches where 9 of 12 rows
already live): retag `dumbbell_pullover` + `barbell_pullover` to
back/`back_lats` with chest secondary, retire `pullover_dumbbell` (worse
id) and `cable_pullover` (dup, §1.1). Alternative: old-school chest home —
then the back twins retire instead, and the other 7 back-family rows retag
to chest, which is far more churn.

**B. Landmine press home (cross-group consistency).** Four landmine press
rows sit in three groups: standing + single-arm → chest (`chest_upper`),
tall-kneeling + half-kneeling-single-arm → shoulders, half-kneeling → CORE
(clearly wrong — it's a press). Gym convention programs landmine presses as
a shoulder-press variant. Recommendation: **all five → shoulders**
(front delts primary, chest + core secondary). Defensible alternative: keep
standing variants as upper-chest builders (current tagging) and move only
the core row to shoulders. Owning sessions (Shoulders/Core) will execute
whichever way this lands.

**C. Dip/ring equipment mapping.** `dip_bars`, `parallel_bars`, AND
`gymnastic_rings` all map to display/gate **"Pull-up Bar"** in
`EQUIPMENT_MAP`. A home user with a doorframe pull-up bar is told they can
do Chest Dips and Ring Push-Ups. Options: (1) accept the power-tower
approximation (status quo, zero work); (2) new "Dip Station" / "Rings"
equipment ids — honest but a cross-stack picker change (bug-4.7 class);
(3) cheap middle: remap `gymnastic_rings` → TRX (rings ≈ suspension
trainer for pushing movements; TRX already exists in the picker), keep
dip bars ≈ pull-up bar. Recommendation: **option 3 now**, option 2 only if
a calisthenics template lands later. Affects chest rows `chest_dip`,
`weighted_chest_dip`, `ring_push_up` + the arms dip family.

**D. Bench gating (plan §4 carry-over).** `SETUP_EQUIPMENT_IDS`
deliberately never gates benches, so bench-press rows are prescribable to
bench-less home users. The coach-true subs already exist (`floor_press`,
`dumbbell_floor_press`, and the Knee Push-Up add below strengthens the
no-equipment pool). Options: (1) status quo — accept "bench" rows in home
plans; (2) model bench as gated equipment + picker entry (cross-stack,
bug-4.7 class); (3) generation-side preference for floor-press variants
when the user's equipment set implies no bench. Recommendation: **1 now**,
revisit 3 alongside the future skill/impact gating work. No catalog edit
either way.

### 1.4 Coverage gaps — proposed adds (7 drafts + runners-up)

Chest is the thinnest group in the catalog (48 rows; arms has 300) yet the
most popular. Verified-missing against the full catalog (several candidates
were dropped because they already exist in arms: Ring Dip, Diamond/
Close-Grip Push-Ups, Close-Grip Bench, assisted dips). No new equipment or
subMuscle ids needed by any draft; all names/aliases verified against both
prescription-regex twins (all infer `reps`); family keys checked — the TRX/
kettlebell drafts intentionally group with their existing equipment-variant
families in the browse UI. Tiering: propose all adds stay untiered
(deliberate — none belongs in the top-staple common list; revisit if browse
popularity says otherwise).

**#1 Knee Push-Up** — the missing beginner regression. Today the easiest
no-equipment chest row is the full Push-Up; the easiest scaled one needs a
bench. Beginner/home onboarding plans need this rung.

```jsonc
{ "id": "knee_push_up", "name": "Knee Push-Up",
  "aliases": ["Kneeling Push-Up", "Modified Push-Up"],
  "description": "A push-up regression performed from the knees that builds pressing strength with a lighter load.",
  "primaryMuscleGroupId": "chest", "subMuscleIds": ["chest_mid"],
  "secondaryMuscleGroupIds": ["shoulders", "arms", "core"],
  "equipmentIds": [], "equipmentAlternativeIds": [],
  "movementPatternIds": ["horizontal_push"],
  "type": "Compound", "position": "Kneeling", "isUnilateral": false,
  "difficulty": "Beginner",
  "instructions": [
    "Start in a plank position with knees resting on the floor and hands under the shoulders.",
    "Keep a straight line from head to knees with the core braced.",
    "Lower the chest toward the floor by bending the elbows.",
    "Press back up to the start position and repeat." ] }
```

**#2 Dumbbell Squeeze Press** — hypertrophy staple (crush/hex press),
shoulder-friendly, no equivalent row exists.

```jsonc
{ "id": "dumbbell_squeeze_press", "name": "Dumbbell Squeeze Press",
  "aliases": ["Crush Press", "Hex Press", "Dumbbell Crush Press"],
  "description": "A flat dumbbell press with the dumbbells pressed together throughout, keeping constant inner-chest tension.",
  "primaryMuscleGroupId": "chest", "subMuscleIds": ["chest_mid"],
  "secondaryMuscleGroupIds": ["shoulders", "arms"],
  "equipmentIds": ["dumbbells", "bench"], "equipmentAlternativeIds": [],
  "movementPatternIds": ["horizontal_push"],
  "type": "Compound", "position": "Lying", "isUnilateral": false,
  "difficulty": "Beginner",
  "instructions": [
    "Lie on a flat bench holding two dumbbells pressed together over the chest with neutral grips.",
    "Squeeze the dumbbells into each other as hard as possible.",
    "Lower the dumbbells to the chest while maintaining the inward squeeze.",
    "Press back to lockout without letting the dumbbells separate and repeat." ] }
```

**#3 TRX Chest Press** — TRX is a supported picker equipment with ZERO
chest rows in the catalog (the entire catalog holds one TRX row).

```jsonc
{ "id": "trx_chest_press", "name": "TRX Chest Press",
  "aliases": ["Suspension Push-Up", "TRX Push-Up", "Suspension Chest Press"],
  "description": "A suspension-trainer press where body angle sets the load, training the chest with a free range of motion.",
  "primaryMuscleGroupId": "chest", "subMuscleIds": ["chest_mid"],
  "secondaryMuscleGroupIds": ["shoulders", "arms", "core"],
  "equipmentIds": ["trx"], "equipmentAlternativeIds": ["gymnastic_rings"],
  "movementPatternIds": ["horizontal_push"],
  "type": "Compound", "position": "Standing", "isUnilateral": false,
  "difficulty": "Beginner",
  "instructions": [
    "Face away from the anchor holding the handles at chest height with arms extended.",
    "Lean forward into a straight-body plank angle; step back to make it harder.",
    "Lower the chest between the handles by bending the elbows.",
    "Press back to full extension keeping the body rigid and repeat." ] }
```

**#4 TRX Chest Fly** — the suspension fly companion; meaningfully harder,
graded accordingly.

```jsonc
{ "id": "trx_chest_fly", "name": "TRX Chest Fly",
  "aliases": ["Suspension Fly", "TRX Fly"],
  "description": "A suspension-trainer fly that adducts the arms against bodyweight for a deep chest stretch and contraction.",
  "primaryMuscleGroupId": "chest", "subMuscleIds": ["chest_mid"],
  "secondaryMuscleGroupIds": ["shoulders", "core"],
  "equipmentIds": ["trx"], "equipmentAlternativeIds": ["gymnastic_rings"],
  "movementPatternIds": ["horizontal_adduction"],
  "type": "Isolation", "position": "Standing", "isUnilateral": false,
  "difficulty": "Intermediate",
  "instructions": [
    "Face away from the anchor with arms extended forward at chest height, body in a forward lean.",
    "Open the arms wide in an arc while the body lowers as one rigid line.",
    "Keep a slight elbow bend and stop at a comfortable chest stretch.",
    "Squeeze the chest to draw the arms back together and repeat." ] }
```

**#5 Kettlebell Floor Press** — the catalog has zero kettlebell chest work;
this is the standard KB pressing staple for home KB owners.

```jsonc
{ "id": "kettlebell_floor_press", "name": "Kettlebell Floor Press",
  "aliases": ["KB Floor Press", "Double Kettlebell Floor Press"],
  "description": "A floor press using kettlebells whose offset load challenges the chest and pressing stability through a shoulder-friendly range.",
  "primaryMuscleGroupId": "chest", "subMuscleIds": ["chest_mid"],
  "secondaryMuscleGroupIds": ["shoulders", "arms"],
  "equipmentIds": ["kettlebell"], "equipmentAlternativeIds": [],
  "movementPatternIds": ["horizontal_push"],
  "type": "Compound", "position": "Lying", "isUnilateral": false,
  "difficulty": "Beginner",
  "instructions": [
    "Lie on the floor with knees bent, holding a kettlebell in each hand at the chest with wrists straight.",
    "Press the kettlebells up to full lockout over the chest.",
    "Lower under control until the upper arms rest lightly on the floor.",
    "Pause briefly, then press again." ] }
```

**#6 Plyo Push-Up** — the missing power/explosive push; popular and a
natural Advanced progression. High-impact — flag for the future skill/
impact gating tag.

```jsonc
{ "id": "plyo_push_up", "name": "Plyo Push-Up",
  "aliases": ["Clap Push-Up", "Explosive Push-Up", "Plyometric Push-Up"],
  "description": "An explosive push-up where the hands leave the floor at the top, building pressing power and rate of force.",
  "primaryMuscleGroupId": "chest", "subMuscleIds": ["chest_mid"],
  "secondaryMuscleGroupIds": ["shoulders", "arms", "core"],
  "equipmentIds": [], "equipmentAlternativeIds": [],
  "movementPatternIds": ["horizontal_push"],
  "type": "Compound", "position": "Lying", "isUnilateral": false,
  "difficulty": "Intermediate",
  "instructions": [
    "Start in a strong plank with hands under the shoulders.",
    "Lower the chest quickly toward the floor under control.",
    "Drive up explosively so the hands briefly leave the ground.",
    "Land with soft elbows, absorb, and flow into the next rep." ] }
```

**#7 Wall Push-Up** — the absolute-beginner/rehab rung below Knee Push-Up;
gives onboarding a true zero-floor progression (wall → knee → full).

```jsonc
{ "id": "wall_push_up", "name": "Wall Push-Up",
  "aliases": ["Wall Press-Up", "Standing Push-Up"],
  "description": "A standing push-up against a wall that introduces the pressing pattern with minimal load.",
  "primaryMuscleGroupId": "chest", "subMuscleIds": ["chest_mid"],
  "secondaryMuscleGroupIds": ["shoulders", "arms"],
  "equipmentIds": [], "equipmentAlternativeIds": [],
  "movementPatternIds": ["horizontal_push"],
  "type": "Compound", "position": "Standing", "isUnilateral": false,
  "difficulty": "Beginner",
  "instructions": [
    "Stand an arm's length from a wall and place both palms on it at shoulder height.",
    "Keep the body in one straight line from head to heels.",
    "Bend the elbows to bring the chest toward the wall.",
    "Press back to the start position and repeat." ] }
```

**Runners-up (no drafts; add only if Dylan wants deeper calisthenics
coverage):** One-Arm Push-Up (Advanced milestone; Archer Push-Up already
covers the progression path), Dive-Bomber Push-Up (Hindu Push-Up), Pseudo
Planche Push-Up. Rejected: Guillotine Press (risk), board/pin/Spoto presses
(powerlifting-niche), Med Ball Chest Pass (needs a throwing wall).

### 1.5 Skill/impact watch list (for the future gating tag)

`bodyweight_chest_fly` (slider fly — sneaky-hard at full extension),
`archer_push_up`, `ring_push_up`, `weighted_chest_dip`, proposed
`plyo_push_up` (impact).

### 1.6 Decisions A–D closed (2026-08-09, commit `f32dcc2`) — Task 1 DONE

Dylan took all four recommendations: **A** pullover home = back
(`dumbbell_pullover` + `barbell_pullover` retagged to back/`back_lats`
with chest+shoulders+core secondaries; back's worse-id twin
`pullover_dumbbell` retired, aliases absorbed). **B** all five landmine
press rows → shoulders (front+side delts, chest secondary) — including
`half_kneeling_landmine_press` out of its wrong CORE home. **C** the three
ring equipment ids gate as TRX instead of Pull-up Bar; dip bars keep the
pull-up-bar approximation (new Dip Station equipment only if a calisthenics
template ever demands it). **D** bench stays non-gating (status quo);
revisit generation-side floor-press preference with the future skill/impact
gating work. Gates: sweep clean, 50/50 suites, eval capture scores and
validator-ok rate identical (two advisory findings-pattern shifts are the
corrected metadata re-scoring old captures — see commit message).
Group counts after: chest 59, back 231, shoulders 197, core 188.

---

## Task 2 — Back A: lats & upper back (2026-08-09)

> **APPLIED 2026-08-09** (commit `ccef300`, Dylan's standing apply-as-we-go
> directive): everything below — the new retire mechanism
> (`src/data/retired-exercise-ids.ts` + spec, wired into the
> `ExercisesService` visibility choke point), all 22 Back A retires plus
> the Task 1 `cable_pullover` rider, all §2.2 corrections including the
> `functional_trainer → Cable` map fix, and the 5 §2.4 adds (catalog
> 1,314 → 1,319 rows; back 224 → 229). Gates: integrity sweep clean on
> all touched rows, 50/50 backend suites (595 tests incl. the new retire
> spec), search goldens green, eval:captures:report byte-identical.
> Decisions 1.3 A–D remain the only Task 1 leftovers.

**Scope.** All 115 back rows whose `subMuscleIds` include `back_lats`
(75 pure `back_lats` + 40 `back_lats+back_upper` — exactly the plan's ~115).
Row-by-row judgment per plan §3; copy read in full for every row.

**Verdict: the opposite of chest — this is the weak model's padding
hotspot.** The staples are all present and correctly tagged (17 pull-up
variants, a saturated pulldown family, honest equipment gating, difficulty
grades almost universally sane), but the slice carries ~20 rows of
single-arm-cable/lying-cable filler generated by permuting position words,
including six exact-duplicate pairs *inside* the slice, two cross-group
duplicates Task 0's name matcher couldn't see (different display names),
one cross-sub duplicate of Back B's `yates_row`, and five rows whose
described movement is physically incoherent (e.g. a "landmine pulldown" —
a landmine cannot resist a downward pull). Coverage gaps are real but few:
the missing rows are Jumping Pull-Up, One-Arm Pull-Up, Machine High Row,
Front Lever, and a kettlebell lat option (the KB × lats cell is empty
catalog-wide).

### 2.1 Retire list (22 rows) — and the retire mechanism this slice adds

No non-cardio retire mechanism existed (the Task 1 `cable_pullover` retire
has been blocked on this). This slice introduces
**`backend/src/data/retired-exercise-ids.ts`** + a spec, wired into the two
`ExercisesService` visibility filters. Because the replace picker, chunk-
repair scavenger, and `getCandidatesForGenerator` all source through
`ExercisesService.search()`, one choke point removes retired rows from
browse, search, generation pools, repair, and replacement candidates, while
`findOne` / `findByIds` / `resolveByName` stay unfiltered — logged history,
saved items, and replace *targets* keep resolving. Ids stay in the JSON
forever (plan §0 rule 1).

| Retire | Class | Reason (keeper in parens) |
| --- | --- | --- |
| `banded_pull_up_overhand` | exact dup | Band-assisted pull-up, same equipment/difficulty (`band_assisted_pull_up`; aliases absorbed) |
| `cable_lat_pulldown_d_handle` | exact dup | Same single-arm pulldown, attachment naming only (`single_arm_cable_pulldown`; +"D-Handle Pulldown" alias) |
| `cable_pull_to_waist_kneeling` | exact dup | Its own alias IS the keeper's name (`half_kneeling_lat_pulldown_cable`) |
| `cable_pulldown_supine_floor` | exact dup | Floor twin of the lying cable pulldown; bench is non-gating setup gear so the rows gate identically (`cable_pulldown_lying_face_up`) |
| `cable_pullover_kneeling` | exact dup | Same kneeling rope pullover (`lat_prayer_cable`; +"Kneeling Cable Pullover" alias) |
| `cable_single_arm_pullover_standing` | exact dup | Near-verbatim copy of the side-on arc pull (`stir_the_pot_lat`, renamed Cable Lat Pull-Around below) |
| `high_cable_lat_pull` | exact dup | Same facing single-arm straight-arm pulldown, pulley-height nuance only (`single_arm_straight_arm_pulldown`) |
| `lat_stretch_pulldown_single_arm` | exact dup | Seated twin of the cross-body pull (`crossover_lat_pulldown`) |
| `pulldown_with_hip_hinge` | exact dup | Hinged twin of the straight-arm pulldown — desc even says "not just adduction" (`straight_arm_cable_pulldown`) |
| `pike_lat_pullover_floor` | cross-group dup | Kneeling ab-wheel rollout re-homed to lats; core owns `kneeling_ab_wheel_rollout` + 5 more rollouts |
| `slam_ball_lat_activation` | cross-group dup | A medicine-ball slam ("Overhead Slam (Lat Focus)"); cardio owns `medicine_ball_slam`. Task 0 missed both (different names) |
| `underhand_barbell_row_lower_lat` | cross-sub dup | IS the Yates row; Back B owns `yates_row` (aliases absorbed there) |
| `db_lat_swing` | incoherent | Standing DB "lat" sweep — gravity cannot resist the lat line standing; the loaded phase is a front raise |
| `landmine_lat_pulldown` | incoherent | A landmine pivots at the floor — pulling the end down is gravity-assisted; no pulldown resistance exists |
| `cable_pull_behind_back` | incoherent | Pull travels from behind-body hyperextension *forward* = shoulder flexion = front delts, tagged lats |
| `cable_pulldown_ankle_strap` | incoherent | Name says "Prone Hip Extension", id says ankle strap, copy describes a prone floor pull with a straight bar; movement (prone SA pulldown) already covered by `banded_lat_pulldown_face_down` + `incline_bench_pulldown` |
| `supine_lat_pull_barbell` | incoherent | Name/id say barbell, equipment says resistance band; alias collides with `prone_lat_activation_floor`; band-lying-lat already 3-deep |
| `battle_rope_lat_pull` | invented | Requires battle ropes anchored *above head height* — not a real setup; bad prescription for battle-rope owners |
| `lat_cable_fly` | invented | "Lat spread" posing simulation graded Advanced; dual-cable straight-arm pattern kept via `dual_cable_straight_arm_pulldown` |
| `cable_single_arm_pulldown_behind` | invented | Single-arm pulldown to *behind the ear* with head turned away — impingement-prone permutation nobody programs |
| `barbell_behind_neck_pull_up` | embarrassment | "Barbell-Assisted Behind-Neck Pull-Up" — feet-assisted yet Advanced, behind-neck under load; the legitimate concept survives as the renamed Smith Machine Seated Pull-Up |
| `dumbbell_row_lat_focused` | miscoached dup | Claims elbow-FLARED rows shift focus *to* the lat (backwards — flare shifts to upper back); correct lat-bias row kept (`one_arm_dumbbell_row_lat_bias`) |

**Also entering the initial retired list: `cable_pullover`** — the Task 1
firm retire (chest), unblocked by the new mechanism. Verified: none of the
23 ids is referenced by common tiers, anchors, fill-ins, plan templates,
videos, or any other backend source.

### 2.2 Metadata corrections applied

Prescription-type fixes (Task 0 §0.4 class — explicit field beats alias
inference, no regex-twin edits):

| Id | Fix | Why |
| --- | --- | --- |
| `pike_pullup` | + `prescriptionType: "reps"` | Alias "L-Sit Pull-Up" trips the L-sit time regex; served timed today |
| `active_hang_scapular_pull` | + `prescriptionType: "reps"`; alias "Active Hang" → "Scap Pull-Up" | "Active Hang" tripped the hang regex AND mislabeled the movement; "Scap Pull-Up" is the gym-speak name |
| `hanging_lat_shrug` | + `prescriptionType: "reps"` | Alias "Dead Hang Lat Depression" trips the hang regex |
| `wall_lat_stretch_active` | + `prescriptionType: "time"` | It's a stretch — no time cue in name, served as reps today |

Renames (recognizable-name policy; old names kept as aliases where they
carry search value):

| Id | Name change | Why |
| --- | --- | --- |
| `overhand_bodyweight_row` | "Pronated Bodyweight Row" → **"Inverted Row"** (+ "Australian Pull-Up", "Bodyweight Row" aliases) | THE canonical name of the most-searched bodyweight row was buried in an alias |
| `smith_machine_lat_pulldown` | "Smith Machine Underhand Row-Pulldown" → **"Smith Machine Seated Pull-Up"** (+ "Seated Pull-Up", "Smith Machine Pull-Up"); difficulty Intermediate → Beginner; desc rewritten | Copy describes the classic bar-fixed seated pull-up regression; old name was word salad, and a regression graded Intermediate blocked its use |
| `suspension_trainer_pullup_prone` | "Suspension Trainer Pull-Up" → **"Feet-Elevated Suspension Trainer Row"**; pattern vertical_pull → horizontal_pull; desc fixed | Copy is unambiguous: low straps, feet on bench, chest to handles = a feet-elevated row, not a pull-up; pattern fix keeps pull-balance honest |
| `suspension_trainer_single_arm_pull` | "Single-Arm Suspension Trainer Pull-Up" → **"Single-Arm Suspension Trainer Row"** (+ "TRX Power Pull"); pattern → horizontal_pull | Same class of mislabel; "TRX Single-Arm Row" was already its own alias |
| `hip_width_feet_elevated_chin_up` | "Feet-Elevated Suspension Chin-Up" → **"Feet-Assisted Chin-Up"** (+ "Bench-Assisted Chin-Up") | No suspension trainer anywhere in the row; feet on the bench *assist* |
| `stir_the_pot_lat` | "Cable Lat Arc Pull" → **"Cable Lat Pull-Around"** (+ "Lat Pull-Around") | The side-on sweep IS the trendy lat pull-around; renaming converts padding into a searched staple |
| `single_arm_lat_stretch_cable` | "Overhead Single-Arm Lat Stretch Cable" → **"Single-Arm Cable Lat Stretch"** | Word-order salad |
| `bar_pulldown_seated_hammer` | "Neutral-Grip Bar Pulldown" → **"Wide Neutral-Grip Pulldown"** | Disambiguates from `lat_pulldown_neutral_grip` ("Neutral-Grip Lat Pulldown", the V-bar row) — wide parallel-handle bar vs close V-bar are different implements with confusable names |

Other metadata:

| Id | Fix | Why |
| --- | --- | --- |
| `barbell_lat_row_elbows_wide` | subMuscles `[back_lats, back_upper]` → `[back_upper, back_mid]`; + shoulders secondary; desc corrected | Elbows-wide row to the upper chest is an upper-back/rear-delt builder; "targets the lats" was backwards science (moves the row to Back B's domain) |
| `yates_row` (Back B row, alias-merge only) | + aliases "Underhand Barbell Row", "Supinated Barbell Row", "Reverse-Grip Barbell Row" | Absorbs the retired `underhand_barbell_row_lower_lat`'s search terms |
| `band_assisted_pull_up` | + aliases "Assisted Pull-Up", "Banded Pull-Up" | Absorbs the retired duplicate |
| `single_arm_cable_pulldown` | + alias "D-Handle Pulldown" | Absorbs the retired duplicate |
| `lat_prayer_cable` | + alias "Kneeling Cable Pullover" | Absorbs the retired duplicate |
| `straight_arm_cable_pulldown` | + alias "Rope Straight-Arm Pulldown" | Rope is already its listed alternative; the rope name is heavily searched |
| `crossover_lat_pulldown` | + alias "Cross-Body Lat Pulldown" | The searched name for the movement |
| `exercise-mappings.ts` | `functional_trainer: 'Machine'` → `'Cable'` | A functional trainer is a dual cable stack; only 3 catalog rows use it (all in this slice) and all were unreachable for Cable-selecting users while gating behind "Machine" |

Not proposed (adversarially self-rejected): position-value cleanups
(#51/#100/#107 positions are display-only — same call as chest); retagging
`kipping_pull_up`/`butterfly_pull_up` difficulty (Intermediate/Advanced
defensible; skill-gate watch list instead); renaming `jm_row_pulldown_hybrid`
(name already fixed at "Lean-Away Single-Arm Cable Pulldown"; id is
immutable); collapsing bench-angle pulldown variants (#39/#52/#92 —
coherent, correctly tagged, position-variant precedent keeps them; they'll
rank low in Task 13).

### 2.3 Decisions / handoffs

**No new Dylan decisions from this slice.** Existing ones it touches:
decision 1.3-A (pullover home) — `pullover_dumbbell` left untouched pending;
the back pullover family (EZ-bar, incline/decline DB, single-arm DB,
machine) verified clean regardless of where A lands. Decision 1.3-C
(rings) — this slice's ring rows still gate as "Pull-up Bar" pending C.

**Handoffs to Back B (Task 3):** verify `yates_row` metadata (it just
absorbed the underhand-row search terms); add candidates whose home is
mid-back: plain **Ring Row** (only Wide-Grip + Weighted exist), **Gorilla
Row** (KB, missing catalog-wide), optional **Elbow-Out Dumbbell Row**
(the retired miscoached row's legitimate concept); `barbell_lat_row_elbows_wide`
arrives re-subbed as upper+mid. **Handoff to Arms B (Task 9):**
`double_overhand_barbell_hang` ("Barbell Dead Hang", kept) is an equipment
variant of arms' `dead_hang` — decide grip-vs-back home there.

### 2.4 Coverage adds (5 rows applied)

Verified missing catalog-wide (id and name); all use existing equipment /
sub-muscle / pattern ids; both prescription-regex twins checked (Front
Lever intentionally times via the existing `front lever` regex on both
sides + explicit field); family keys verified non-colliding (Kettlebell
Pullover deliberately joins the pullover equipment-variant family). All
untiered (chest precedent).

1. **Jumping Pull-Up** (`jumping_pull_up`) — the missing rung between
   band-assisted and full pull-up; Beginner, bodyweight+bar, leg-drive
   secondary. 2. **One-Arm Pull-Up** (`one_arm_pull_up`) — the iconic
   Advanced milestone; only the assisted progression existed. 3. **Machine
   High Row** (`machine_high_row`) — plate-loaded/iso-lateral high row, a
   top-tier gym staple with zero machine coverage (only cable high rows
   existed); generic `machine` equipment id. 4. **Front Lever**
   (`front_lever`) — the calisthenics goal isometric both regex twins
   already anticipate; timed, Advanced, bar with rings alternative.
   5. **Kettlebell Pullover** (`kettlebell_pullover`) — fills the empty
   KB × lats cell with a floor-based row requiring nothing but the bell.

### 2.5 Skill/impact watch list additions

`kipping_pull_up`, `butterfly_pull_up` (technique-gated — Intermediate/
Advanced grades are honest but both need the future skill tag),
`bar_muscle_up`, `ring_muscle_up`, `one_arm_pull_up`, `front_lever`,
`typewriter_pull_up`, `pull_up_explosive` (impact), `rope_climb_lat`
(descent skill), `pulldown_behind_neck` (mobility-dependent).

### Counts summary (Back A)

| Item | Count |
| --- | --- |
| Rows reviewed | 115 |
| Retired (incl. `cable_pullover` rider) | 22 (+1) |
| — exact in-slice dups | 9 |
| — cross-group / cross-sub dups | 3 |
| — incoherent / invented / miscoached | 10 |
| Prescription-type fixes | 4 |
| Renames | 8 |
| Other metadata fixes | 8 (incl. 1 equipment-map line) |
| Adds | 5 |
| Back A rows visible after slice | 97 (115 − 22 retired − 1 re-subbed + 5 adds) |

---

## Task 3 — Back B: mid/lower back & traps (2026-08-09)

> **APPLIED 2026-08-09** (commit `a7e1019`, same session as the findings;
> Dylan's three decisions taken live, all per recommendation): 21 retires
> (retired list now 45 ids), 11 group-home retags, 2 rebuilds, renames +
> 12 keeper alias absorbs, common-tier + anchor re-points, Ring Row and
> Gorilla Row added (catalog 1,321 rows; visible back 178 of 221; legs
> 302, shoulders 201). Search goldens + one enrichment fixture updated
> for the re-pointed ids. Gates: touched-row sweep clean, 50/50 suites
> (595 tests), eval mean/median/validator-rate identical with three
> ±1-point capture shifts fully explained by stacking advisories
> re-firing under corrected group tags.

**Scope.** All 110 back rows without `back_lats` (109 from the plan snapshot
+ `barbell_lat_row_elbows_wide`, re-subbed in from Back A). Every row judged
per plan §3 with full copy reads.

**Verdict: low filler, high mis-homing.** The row/shrug/back-extension core
of this slice is genuinely excellent — the popular staples are all present
(Pendlay, Yates, Meadows, Seal, Kroc, T-Bar, chest-supported family, eight
shrug variants, four back-extension variants) with honest equipment and
sane difficulty. The problems are structural, all inherited from per-group
generation: (1) the **posterior-chain hinge family** was duplicated into
back — seven Task 0 twin pairs live here plus eight un-twinned hinge
stragglers whose family home (legs) already holds every keeper; (2) the
**rear-delt / upright-row / face-pull families** are split against a
complete, correctly-tagged shoulders family, producing seven more dup-class
rows; (3) three rows describe wrong or impossible movements (a bilateral
barbell "Bear Row" from bear crawl — nothing would hold you up; "Monkey
Row" describing a prone incline row; "Machine Upright Row" that is a cable
exercise). **Dylan's three calls this session (all per recommendation):
hinge singletons → legs; sumo keeps the legs twin with refs re-pointed;
face pulls home in shoulders.**

### 3.1 Retires (20 rows)

Task 0 §0.1 twin pairs resolved this session (keeper in parens — all
keepers verified live; aliases absorbed onto keepers):

| Retire | Keeper |
| --- | --- |
| `deadlift_conventional` | legs `conventional_deadlift` (+ "Deadlift", "Standard Deadlift" aliases). The template scan hit was a false positive — an invariants-spec assertion already *forbids* templates using this twin; no template edit needed |
| `romanian_deadlift` ⚠C | legs `barbell_romanian_deadlift` (also common-tiered; the retired entry is removed from the common list). Its "Stiff-Leg Deadlift" alias was WRONG (SLDL is a different exercise legs already has) and dies with the row |
| `sumo_deadlift` ⚠A/C | legs `barbell_sumo_deadlift` (+ "Wide-Stance Deadlift" alias); anchor + common entries re-pointed — decision, Dylan 2026-08-09 |
| `good_morning` ⚠C | legs `barbell_good_morning` (+ "Good Morning" alias); common entry re-pointed |
| `barbell_good_morning_seated` | legs `seated_good_morning` (same name, same equipment) |
| `single_leg_rdl` | legs `dumbbell_single_leg_romanian_deadlift` (+ "Single-Leg RDL", "SLRDL", "Single-Leg Romanian Deadlift" aliases) |
| `barbell_hip_thrust_back_ext` | legs `barbell_hip_thrust` (+ "Hip Thrust", "Hip Bridge" aliases) |
| `farmers_carry` | core `farmer_carry` (+ "Farmer's Carry", "Farmer's Walk" aliases) — this was a THIRD twin Task 0 missed (its pair was core-vs-arms); core/arms sessions still decide the carry family's final home |

Cross-group dups against the complete shoulders families (Task 0 caught
two of these as name-pairs; the rest have different names):

| Retire | Shoulders keeper |
| --- | --- |
| `band_face_pull` | `resistance_band_face_pull` (Task 0 pair; home decision) |
| `cable_face_pull_single_arm` | `single_arm_cable_face_pull` (Task 0 pair) |
| `scapular_retraction_band` | `band_pull_apart` (Task 0 pair; + "Band Scapular Retraction" alias) |
| `cable_rear_delt_fly` | `cable_reverse_fly` (aliases already cross-referenced each other) |
| `dumbbell_reverse_fly` | `bent_over_dumbbell_reverse_fly` (+ "Dumbbell Reverse Fly", "Bent-Over Lateral Raise" aliases) |
| `incline_reverse_fly` | `incline_bench_rear_delt_fly` (+ "Incline Bench Reverse Fly" alias) |
| `machine_upright_row` | `cable_upright_row` — copy is a low-cable + short-bar upright row, i.e. the shoulders row verbatim |
| `wide_grip_seated_cable_row_single` | `single_arm_rear_delt_cable_row` — "Unilateral Rear Delt Row" was its own alias |

In-slice / cross-slice dups and incoherents:

| Retire | Reason |
| --- | --- |
| `seated_good_morning_band` | "Banded Good Morning" — exact dup of legs' `resistance_band_good_morning` (same band, same subs; their aliases pointed at each other). Surfaced when the hinge retag landed it next to its twin; keeper absorbs the "Banded Good Morning" alias |
| `barbell_row_supine` | Copy is verbatim the Inverted Row (bar low in rack, pronated, body rigid) — Back A's keeper `overhand_bodyweight_row` |
| `landmine_row_bilateral` | Same movement as `t_bar_row` (straddle landmine, hinge, row the end); T-Bar already carries the "Landmine Row" alias (+ "Bilateral Landmine Row" absorbed) |
| `cable_straight_arm_row` | Chest-height straight-arm pull to hips = pulley-height variant of `straight_arm_cable_pulldown` — the exact dup class retired in Back A |
| `cable_high_row_elbows_wide` | Copy: "pull the rope toward your face with elbows flaring wide" — it IS a face pull (`face_pull` keeper) |

### 3.2 Group-home retags (12 rows; ids unchanged, so all refs survive)

**To legs (decision: hinge home = legs, Dylan 2026-08-09)** — glutes/
hamstrings primary, back+core secondaries (trap-bar gets glutes+quads;
swings keep shoulders credit; suitcase keeps arms/grip credit):
`kettlebell_swing` ⚠C/T, `single_arm_kettlebell_swing`,
`cable_pull_through` ⚠C (band twin already lives in legs),
`glute_ham_raise` (a hamstring exercise by mechanics — knee-flexion
eccentric), `suitcase_deadlift`, `trap_bar_deadlift` ⚠C/T,
`deficit_deadlift` (7 — the eighth, `seated_good_morning_band`, turned
out to duplicate a legs-native row and retired instead, see §3.1). Kept in back deliberately: `rack_pull`,
`deadlift_snatch_grip_rack_pull`, `snatch_grip_deadlift` (their programming
identity is trap/upper-back loading), `power_clean`, `high_pull`,
`dumbbell_high_pull` (explosive trap family), `tire_flip` (strongman
full-body; unmodeled equipment), all back extensions / reverse hyper /
superman / GHD work (erector-primary).

**To shoulders (decision: face-pull home = shoulders + the two upright-row
stragglers of an 8-row shoulders family)** — rear-delts primary (upright
rows: side+front delts per family convention), back secondary:
`face_pull` ⚠C/T (refs survive), `low_cable_pull_apart`,
`barbell_upright_row` ⚠C, `dumbbell_upright_row`. The Shoulders session
(Task 7) re-verifies all four in place.

### 3.3 Fixes

| Id | Fix | Why |
| --- | --- | --- |
| `bear_row` | Rebuilt: equipment barbell→dumbbell (alt kettlebell), isUnilateral true, instructions/description rewritten | Copy described a BILATERAL BARBELL row from bear-crawl — impossible (no support); the real bear row is an alternating single-dumbbell row from bear plank |
| `monkey_row` | Rebuilt: standing, dumbbells only (incline bench dropped), instructions/description rewritten to the real elbows-drag-up-the-sides movement; alias "Dumbbell Spider Row" dropped | Copy described a prone incline wide row — not a monkey row, and that movement is already covered by the chest-supported and rear-delt row families |
| `bent_over_dumbbell_shrug` | Rename → "Prone Incline Dumbbell Shrug" | Copy (and its own alias) describe the prone-on-incline-bench version, not a standing bent-over shrug |
| `kroc_row` | Drop alias "Renegade Row Heavy" | Renegade row is a different exercise with its own row (`renegade_row`) — search pollution |
| `barbell_deadrow` | Aliases → "Dead Row", "Deadlift Row Combo" (drop "Dead-Stop Row") | It is a deadlift+row combo per its copy — KEPT as distinct; but "Dead-Stop Row" is Pendlay's territory |
| `superman_hold` | + alias "Superman" | The searched name; rep-supermans are covered by this row's existing rep-hold pattern |
| `hyperextension_back_extension` | Drop alias "45-Degree Back Extension" | That is the exact name of legs' glute-focused `forty_five_degree_back_extension` — a cross-group near-twin of this row. **Handoff to Legs B/C:** decide whether the erector-vs-glute back-extension split stays (coached differently) or one retires |
| `resistance_band_good_morning` (legs, alias-merge only) | + alias "Banded Good Morning" | Absorbs the retired duplicate's name |
| `t_bar_row`, `conventional_deadlift`, `barbell_sumo_deadlift`, `barbell_good_morning`, `dumbbell_single_leg_romanian_deadlift`, `barbell_hip_thrust`, `farmer_carry`, `bent_over_dumbbell_reverse_fly`, `incline_bench_rear_delt_fly`, `band_pull_apart` | Alias absorbs per §3.1 tables | Keeps every retired row's search terms alive on its keeper |
| `common-exercise-ids.ts` | Remove `romanian_deadlift`; `good_morning` → `barbell_good_morning`; `sumo_deadlift` → `barbell_sumo_deadlift` | Retired rows must leave the tier list (spec-enforced); keepers inherit the pool/browse priority |
| `anchor-exercises.ts` | `sumo_deadlift` → `barbell_sumo_deadlift` | Anchor pool follows the keeper |

Not proposed (adversarially self-rejected): moving `power_clean`/high
pulls to legs (their trap-focused tagging is the reason a coach picks
them); renaming `barbell_row_45_degree_hip_pad` (coherent supported-row
niche, Task 13 will rank it); difficulty churn on upright rows
(shoulders session's call now); sub tweaks on `inverted_row_supinated`
(mid+traps is defensible for the supinated pull).

### 3.4 Coverage adds (2 rows)

The row/shrug/extension staples survey came back saturated (everything
from Pendlay to Helms-row-adjacent chest-supported variants exists), so
only two genuine gaps — both Back A handoffs confirmed missing
catalog-wide:

1. **Ring Row** (`ring_row`) — the fundamental ring pull; only Wide-Grip
   and Weighted variants existed. Beginner, rings, reps.
2. **Gorilla Row** (`gorilla_row`) — the trendy KB staple: two bells on
   the floor, hinge held, alternating rows. Intermediate, kettlebells,
   unilateral, reps.

Runners-up (not added): Helms Row (chest-braced DB row — niche),
Hang Clean (Olympic-lift depth beyond the app's lane; `power_clean`
covers the pattern), Batwing Row (isometric niche).

### 3.5 Skill/impact watch list additions

`power_clean`, `high_pull`, `dumbbell_high_pull` (explosive barbell/DB
technique), `glute_ham_raise` (now legs — brutal eccentric graded Advanced
✓), `tire_flip` (impact + equipment), `barbell_row_legs_drive` (the
"cheat row" — Advanced ✓, coaching-sensitive), `kroc_row` (controlled
momentum), upright rows (impingement-sensitive — flagged for the
shoulders session).

### Counts summary (Back B)

| Item | Count |
| --- | --- |
| Rows reviewed | 110 |
| Retired | 21 |
| — Task 0 twin pairs closed | 8 |
| — shoulders-family dups | 8 |
| — in/cross-slice dups | 5 |
| Retagged to legs | 7 |
| Retagged to shoulders | 4 |
| Rebuilt (wrong movement) | 2 |
| Renames / alias fixes | 5 (+12 keeper alias absorbs) |
| Reference re-points | 4 entries (3 common, 1 anchor) |
| Adds | 2 |
| Visible back rows after slice | 178 (of 221 in-group; 43 back-tagged rows now retired across Tasks 1–3) |

---

## Task 4 — Legs A: quads (2026-08-10)

> **APPLIED 2026-08-10** (commit `a75b32e`, same session as the findings;
> Dylan's brief this session: "don't be shy to add and remove workouts …
> really look into what I have, what I am missing, and what should be
> removed"). 81-row glutes-credit fix (closes Task 0 §0.2 in full), 1
> retire (retired list 46), 1 rename, 2 difficulty fixes, 5 alias adds,
> 7 coverage adds (catalog 1,328 rows; legs 309, all visible; cardio
> visible 49). `bodyweight_squat` tiered into common and added to the
> legs/lower/lower-body/full-body anchor pools. Gates: touched-row sweep
> clean, 50/50 suites (595 tests; one enrichment spec extended for the
> new anchor, same maintenance Task 3's re-point required), eval
> captures report **byte-identical** to baseline.

**Scope.** All 104 legs rows carrying `legs_quads` (103 pure + the
glutes+quads `trap_bar_deadlift`, which is Legs B's hinge-keeper to
verify and was left untouched). Every row judged per plan §3 with full
copy reads.

**Verdict: the healthiest big slice yet.** Zero invented movements, zero
in-slice duplicates, honest equipment gating throughout, difficulty
almost entirely sane. The weak model's ~100-per-bucket padding
materialized here as a large but *legitimate* variant matrix
(front-rack/landmine/smith/cable permutations of split squats, lunges,
and step-ups — all real, coached variants; Task 13 ranking will sort
their pool priority). The slice's real problems were structural: the
entire catalog-wide 81-row invalid-`glutes`-secondary class lives here,
the single most fundamental exercise in fitness (the bodyweight squat)
was missing from the catalog entirely, and one cross-group sled twin
escaped Task 0's name-matcher.

### 4.1 The 81-row glutes-credit fix (Task 0 §0.2 — closed)

All 81 rows catalog-wide with the invalid `glutes` entry in
`secondaryMuscleGroupIds` turned out to sit in this slice (squats, split
squats, lunges, step-ups/downs, pistols, leg presses, sled drag). Task
0's proposed disposition ("delete the invalid entry, let `legs_glutes`
in subs carry the emphasis") assumed the sub was already present — the
spot-check showed it was NOT on any of the 81. Applied fix: remove the
invalid secondary AND append `legs_glutes` to `subMuscleIds`, so the
glute credit finally reaches body maps, filter chips, and previews.
`legs_quads` stays first (lead emphasis). **Slice-boundary consequence
for Legs B**: its slice is now "legs rows with `legs_hamstrings`, or
`legs_glutes` without `legs_quads`" — the 81 expanded rows are already
audited.

### 4.2 Retire (1) — cross-group sled twin Task 0 missed

| Retire | Keeper |
| --- | --- |
| `sled_drag_backward` (cardio, "Sled Drag (Backward)") | legs `backward_sled_drag` — same movement, both already aliased "Reverse Sled Drag"; name difference is why Task 0's matcher missed the pair. Muscle-true home = legs, matching `lateral_sled_drag` (legs) while `sled_push` stays cardio (conditioning identity). Keeper absorbs the "Sled Drag (Backward)" name as alias; the retired id's line removed from `cardio-display-order.ts`. Task 11 re-reviews the cardio sled section |

That is the only retire — nothing else in the slice met the bar
(dup / incoherent / harmful). Kept-after-scrutiny: `cable_step_up`,
`landmine_step_up`, `smith_machine_step_up` (rare but real and
coherently coached — niche is Task 13's problem, not a retire);
`step_down` vs `forward_step_down` (copies genuinely distinguish
edge-lowering vs anterior lowering; `lateral_step_down` lives in Legs
C); `clean_and_jerk` (real, honestly Advanced, unreferenced);
`barbell_hack_squat`, `hatfield_squat`, `vertical_leg_press` (real
niche equipment/variants).

### 4.3 Fixes

| Id | Fix | Why |
| --- | --- | --- |
| `rear_foot_elevated_split_squat` | Rename → **"Bulgarian Split Squat"**; aliases → [Rear-Foot-Elevated Split Squat, RFESS, Bodyweight Bulgarian Split Squat] | It already carried the Bulgarian alias; the swap puts the searched-for name first and lets `exerciseFamily` group it with the Dumbbell/Barbell/Smith Bulgarian rows instead of standing as a lone RFESS family |
| `barbell_thruster` | Difficulty Advanced → Intermediate | Squat+press with no oly-lift technical barrier; group-fitness staple |
| `safety_bar_split_squat` | Difficulty Advanced → Intermediate | Family consistency: `barbell_split_squat` is Intermediate and the SSB version is no harder (`safety_bar_squat` = `back_squat` = Intermediate already agree) |
| `back_squat` | + alias "Barbell Squat" | Top search term for the row |
| `horizontal_leg_press` | + alias "Seated Leg Press" | The pin-loaded machine every commercial gym labels this way |
| `poliquin_step_up` | + alias "Petersen Step-Up" | The two names are used interchangeably in the wild |
| `belt_squat` | + alias "Hip Belt Squat" | Common synonym |
| `backward_sled_drag` | + alias "Sled Drag (Backward)" | Absorbs the retired twin's display name |

Prescription types verified, no fixes needed: both regex twins catch
`\bwall\s+sit\b` (name) and `\bsled\b` (carry), so Weighted/Single-Leg
Wall Sit and Backward Sled Drag already serve as timed — consistent
with Task 0's clean bill for these rows.

### 4.4 Coverage adds (7 rows) — the "what am I missing" pass

Catalog-wide survey of quad staples across machines / barbell /
dumbbell / cable / kettlebell / bodyweight found the machine, barbell,
and permutation coverage already saturated — but the **bodyweight/home
tier had the single biggest hole in the entire catalog**:

1. **Bodyweight Squat** (`bodyweight_squat`, aliases Air Squat, BW
   Squat) — was missing everywhere. Beginner. Tiered into
   `COMMON_EXERCISE_IDS` (after `goblet_squat`) and appended to the
   legs/lower/lower-body/full-body **anchor pools**, closing a real
   generation gap: those pools' stated design ("home users always have
   a reachable anchor") was false for bodyweight-only users, whose leg
   days had NO reachable anchor.
2. **Bodyweight Box Squat** (`bodyweight_box_squat`, aliases Chair
   Squat, Sit-to-Stand Squat) — THE true-beginner regression;
   bench-gated (non-gating for home per Task 1 decision D), groups
   with `box_squat`.
3. **Dumbbell Squat** (`dumbbell_squat`) — the basic DBs-at-sides home
   staple. ⚠ Deliberately NOT aliased "Dumbbell Suitcase Squat": the
   word "suitcase" trips the carry regex in both prescription twins
   and would have served a rep squat as timed — the exact §0.4 alias
   bug class. Future adds must screen alias wording against both
   twins.
4. **Heels-Elevated Goblet Squat** (`heels_elevated_goblet_squat`,
   aliases Cyclist Squat, Cyclist Goblet Squat) — the popular modern
   quad-bias variant; gates dumbbell + weight_plate (the elevation is
   the exercise's identity).
5. **Suspension Trainer Squat** (`suspension_trainer_squat`, TRX
   Squat) — the basic assisted squat (only split-squat/pistol TRX
   variants existed); beginner/rehab accessibility.
6. **Resistance Band Squat** (`resistance_band_squat`, Banded Squat) —
   band-only home users had no loadable bilateral squat.
7. **Dumbbell Thruster** (`dumbbell_thruster`) — hugely popular
   conditioning staple; `barbell_thruster` listed dumbbells only as
   non-gating alternatives, so DB-only users could never receive a
   thruster.

Rejected after survey (with reasons, for Task 13 context): Anderson/pin
squat (box squat owns dead-stop), Jefferson squat (obscure), duck
walk/squat pulse (novelty), ATG split squat (FFESS + deficit rows cover
the concept), Smith front squat (niche), weighted pistol
(counterbalance row covers), single-KB front squat (goblet covers).
Missing-but-cardio-lane (handoff to Task 11): Jumping Lunge, Wall
Ball, Broad Jump — the plyo/conditioning convention puts them with
`jump_squat_bodyweight`/`plyo_box_jump`, not legs.

### 4.5 Skill/impact watch list additions

`overhead_squat` (mobility ceiling), `clean_and_jerk` (oly technique —
instructions already say "learn with a coach"), `pistol_squat` /
`shrimp_squat` (Advanced ✓ honest), `barbell_walking_lunge` /
`front_rack_walking_lunge` (Advanced ✓ — balance under load),
`barbell_hack_squat` (awkward bar path behind the legs),
`barbell_thruster` / `dumbbell_thruster` (complexes — now
Intermediate).

### Counts summary (Legs A)

| Item | Count |
| --- | --- |
| Rows reviewed | 104 |
| Data-corrupting fixes (glutes credit) | 81 |
| Retired | 1 (retired list 45 → 46) |
| Renamed | 1 |
| Difficulty fixes | 2 |
| Alias adds | 5 rows |
| Adds | 7 (catalog 1,321 → 1,328) |
| Common tier | +1 (`bodyweight_squat`) |
| Anchor pools | +`bodyweight_squat` × 4 focuses |
| Eval gate | report byte-identical; 50/50 suites (595 tests) |
| Visible legs rows after slice | 309 of 309 (no legs retires) |

---

## Task 5 — Legs B: hamstrings & glutes (2026-08-10)

> **APPLIED 2026-08-10** (commit `aa4719c`, same session as the findings,
> same widened Dylan brief as Task 4). 2 retires (retired list 48), 1
> group-home retag ARRIVING (back's reverse hyper → legs), 7 row fixes,
> 4 coverage adds (catalog 1,332; legs in-group 314 / visible 312; back
> visible 177). Gates: 50/50 suites (595 tests), eval captures report
> **byte-identical** to baseline — second perfect gate in a row.

**Scope.** All 98 rows matching the post-Task-4 slice definition
(`legs_hamstrings`, or `legs_glutes` without `legs_quads`) — 97 live
plus the already-retired `seated_good_morning_band`. Every row judged
per plan §3 with full copy reads, including all Task 3 hinge arrivals.

**Verdict: healthy and saturated, with cross-group seams.** The
RDL (×8) / SLDL (×3) / deadlift (×5) / good-morning (×6) hinge keeper
families all verified clean — honest equipment, correct tags, and
Beginner-friendly home options in every family. Hip thrusts (×10),
glute bridges (×10), and leg curls (×20 across machine / cable / band /
DB / ball / slider / towel / TRX) are saturated with legitimate
variants. The problems were seams: a reverse-hyper family split across
back and legs, one implement-twin pair, Task 3 retag residue in copy,
and the quintessential home hamstring exercise gated behind a machine
label.

### 5.1 The equipment-id twin question — resolved as NON-gating

The slice exposed catalog-wide id twins Task 0's referential check
could not flag (both sides resolve): `cable` (33 rows) vs
`cable_machine` (197), `bench` (89) vs `flat_bench` (59), `safety_bar`
(1) vs `safety_squat_bar` (3). **Verified harmless at runtime**:
`EQUIPMENT_MAP` normalizes both sides of each pair to the same display
label ('Cable' / 'Machine' / 'Barbell'), `equipmentSatisfies` matches
at the label level, and both bench ids sit in `SETUP_EQUIPMENT_IDS`
(never gate). A migration would produce zero behavior change, so none
was done — logged as a Task 12 hygiene consideration only.

### 5.2 Retires (2) — implement twins

| Retire | Keeper |
| --- | --- |
| `towel_leg_curl` | `slider_leg_curl` — same movement, mutual equipment alternatives, and `towel`/`slider` both map to the 'Bodyweight' label, so the rows are gating-identical duplicates at runtime. Keeper absorbs the "Towel Leg Curl" alias (towels stay mentioned as the improvised implement) |
| `single_leg_towel_leg_curl` | `single_leg_slider_leg_curl` — same reasoning; alias absorbed |

Kept-after-scrutiny: the stability-ball and TRX curl families (distinct
feel and different gating labels); `forty_five_degree_back_extension`
vs `glute_ham_developer_hip_extension` (different apparatus, both
coherent); `bench_reverse_hyperextension` (bench is non-gating, so this
is the reachable home reverse hyper); the four B-stance RDL rows (real
trend, already niche-sorted by the `b.?stance` regex);
`kettlebell_swing_conditioning` (cardio) — NOT a twin of legs'
`kettlebell_swing` but a deliberate conditioning-format row like Sled
Push, per the cardio modality convention (Task 11 confirms).

### 5.3 Group-home retag — reverse hyper family unified in legs

`reverse_hyperextension` (the bilateral machine row) sat in back while
`single_leg_reverse_hyperextension` (same machine) and
`bench_reverse_hyperextension` sat in legs — one family, two homes.
Its own copy leads "A lower back **and glute** exercise…", and the
coaching consensus for reverse hypers is glute/ham-primary with
isometric erectors. Retagged → legs (`legs_glutes`+`legs_hamstrings`,
sec back+core) with pattern `hinge` → `hip_extension` to match its
family. This *refines* Task 3's blanket "back extensions / reverse
hyper / superman stay back" call with family-level evidence — the
bench back-extension and superman families DO stay in back
(erector-primary, unchanged). The 45°-bench **glute-vs-erector split
stays** (Task 3's handoff decision, now closed): legs'
`forty_five_degree_back_extension` is coherently hip-dominant coached,
back's `hyperextension_back_extension` is erector-coached, names no
longer collide.

### 5.4 Fixes

| Id | Fix | Why |
| --- | --- | --- |
| `glute_ham_raise` | Pattern `hinge` → `leg_curl` | Knee-flexion eccentric by mechanics (Task 3 said so when retagging it to legs, but left the pattern); `razor_curl` precedent. Keeps GHR out of hinge pattern-stacking logic |
| `nordic_hamstring_curl` | eq `[bodyweight, nordic_bench]` → `[bodyweight]`; alt → `[nordic_bench, partner_assist]`; instruction names the improvised anchor | `nordic_bench` maps to the 'Machine' label and is not setup gear, so bodyweight-only users could NEVER receive the quintessential home hamstring exercise. Ankle anchoring is improvisable (pad/low bar/partner) — same philosophy as the setup-gear rule. Difficulty stays Advanced |
| `kettlebell_swing` | Description "emphasis on the lower back and glutes" → "glutes and hips"; alt += `dumbbell` | Task 3 retagged the row to legs but the copy still coached it back-first; DB swing is a genuine coached substitute |
| `cable_pull_through` | Description + final instruction de-back-ified ("squeezing your glutes at the top") | Same Task 3 residue |
| `back_extension_machine` | Rename → "Machine Back Extension"; aliases ["Back Extension Machine", "Seated Back Extension"] | Name described the equipment, not the exercise (Machine Hack Squat / Machine Hip Thrust style). Tags stay legs/glutes+hams — its copy is coherently hip-extension coached, mirroring the 45° split |
| `slider_leg_curl`, `single_leg_slider_leg_curl` | Alias absorbs from the retired towel twins | Keeps the search terms alive |

### 5.5 Coverage adds (4 rows)

The glaring one: **every "kickback" in the catalog was a triceps row**
— the glute kickback, one of the most popular gym movements of the
era, did not exist in any form beyond kneeling donkey kicks.

1. **Cable Glute Kickback** (`cable_glute_kickback`) — standing ankle-
   strap hip extension; aliases Cable Hip Extension, Standing Glute
   Kickback. Beginner.
2. **Machine Glute Kickback** (`machine_glute_kickback`) — the
   lever/multi-hip machine version; uses the EXISTING
   `multi_hip_machine` equipment id (no cross-stack change needed).
   Beginner.
3. **Kas Glute Bridge** (`kas_glute_bridge`) — the trendy short-range
   constant-tension hip thrust variation; barbell+bench, Intermediate,
   deliberately glutes-only sub emphasis.
4. **Assisted Nordic Hamstring Curl** (`assisted_nordic_hamstring_curl`)
   — band-assisted regression filling the gap below the Advanced-only
   Nordic family; Intermediate.

Rejected after survey: standing banded kickback (donkey-kick family
covers home hip extension), snatch-grip RDL (niche), frog pump variants
beyond the existing two, single-leg good morning loaded variants
(bodyweight row + DB alt covers), machine erector back-extension for
the BACK group (real gap, but back's slice is closed — Task 12 note).

### 5.6 Skill/impact watch list additions

`nordic_hamstring_curl` (now home-reachable — brutal eccentric,
Advanced ✓ honest), `glute_ham_raise` + `razor_curl` (GHD family),
`barbell_single_leg_romanian_deadlift` (balance under bar),
`seated_good_morning` (loaded seated hinge, Advanced ✓), the
single-leg walkout / ball / slider / TRX curl tier (all Advanced ✓).

### Counts summary (Legs B)

| Item | Count |
| --- | --- |
| Rows reviewed | 98 (97 live + 1 already retired) |
| Retired | 2 (retired list 46 → 48) |
| Group-home retags (arriving) | 1 (`reverse_hyperextension` back → legs) |
| Row fixes | 7 (1 pattern, 1 gating, 2 copy, 1 rename, 2 alias absorbs) |
| Adds | 4 (catalog 1,328 → 1,332) |
| Decisions closed | 45° glute-vs-erector split STAYS; hinge keepers verified; equipment-id twins non-gating; swing-conditioning is a modality row |
| Eval gate | report byte-identical; 50/50 suites (595 tests) |
| Visible legs rows after slice | 312 (314 in-group − 2 towel retires); back visible 177 |

## Task 6 — Legs C: calves + inner/outer thighs (2026-08-10)

> **APPLIED 2026-08-10** (commit `b2df0f4`, same session as the findings,
> same widened Dylan brief as Tasks 4–5). 2 retires (retired list 50),
> 14 row fixes, 2 coverage adds (catalog 1,334; visible 1,284; legs
> in-group 316 / visible 312; core visible 187). Gates: 50/50 suites
> (595 tests), eval captures report **byte-identical** to baseline —
> third perfect gate in a row.

**Scope.** All 100 rows tagged `legs_calves` (34), `legs_inner_thighs`
(33), or `legs_outer_thighs` (33) — zero overlap with the Task 4/5
slices (the weak model tagged every sumo/cossack/lateral compound
inner-only, so nothing here was pre-audited), plus a cross-group name
sweep that caught the one out-of-group family member
(`bench_copenhagen_plank`, core).

**Verdict: the cleanest slice of the audit.** Calves are saturated
across every implement (standing/seated/donkey/leg-press/hack/Smith
machines, barbell, dumbbell + singles, kettlebell, plate, cable, band,
belt-squat, dip-belt, trap bar, bodyweight + stair + toe walks) and the
adductor/abductor coverage is genuinely complete (machines + multi-hip,
cable cuff work, five distinct band walks, clamshell/fire-hydrant
families, Copenhagens, ball squeezes, side planks, the full sumo /
lateral-lunge / cossack / curtsy / lateral-step complex). Only one
invented movement and one cross-group dup — the real work was
sub-muscle truth and one gating bug class.

### 6.1 Task handoff items — all verified and closed

- **`barbell_sumo_deadlift` keeper (Task 3 re-point)**: healthy. Name,
  absorbed aliases ("Sumo Deadlift", "Wide-Stance Deadlift"), copy,
  difficulty, and the anchor/common re-points all check out. Only nit:
  `trap_bar` sat in its alternatives — a trap bar's frame physically
  blocks a wide stance (fixed → `dumbbell`).
- **Sumo squat family** (5 rows) + **sumo deadlift family** (4): all
  real, all honestly equipped, Beginner entries exist (BW/DB/KB).
- **Cossack family** (4): bodyweight/goblet/landmine + a Beginner
  TRX-assisted regression — a complete difficulty ladder.
- **`lateral_sled_drag`**: correctly lives in legs (matches Task 4's
  `backward_sled_drag` decision); `sled` word correctly triggers the
  carry/timed prescription.
- **Lateral step family** (5: step-up, DB step-up, step-down, crossover
  step-up, box step-over): five distinct, real movements — kept intact.
- **`multi_hip_machine` rows** (2, standing ab/adduction): fine, and now
  share their equipment id with Task 5's `machine_glute_kickback` as
  intended.

### 6.2 Retires (2)

| Retire | Why |
| --- | --- |
| `barbell_donkey_calf_raise` | Physically incoherent: a free barbell cannot be secured across the hips/lower back in a 90° hinge (its own instructions hedge "securely… in the donkey setup"). Real donkey loading = machine, partner, dip belt, or the fixed-path Smith row — all of which the family keeps |
| `bench_copenhagen_plank` (core) | Cross-group dup of legs' `copenhagen_knee_plank`: both are the knee-on-bench short-lever hold (the core row is even aliased "Short-Lever Copenhagen Plank"). Copenhagen family home = legs/inner (the adductor identity is the point); keeper absorbs both aliases. Core keeps its side-plank families |

Kept-after-scrutiny: `smith_machine_donkey_calf_raise` (fixed path makes
the bent-over setup real, unlike the free-bar version); the single-leg
seated ab/adductor-machine rows (machine-dependent but practiced; the
multi-hip rows are the canonical unilateral machine path); the
ball-squeeze quartet (`exercise_ball` → 'Medicine Ball' gating is
conservative-but-honest, and the rows themselves advertise pillow/foam
alternatives); the two ankle-weight rows (`ankle_weights` maps to the
free 'Bodyweight' label by deliberate light-accessory convention —
served unloaded they are legitimate standing leg raises); toe walks;
cable calf raises; all five band walks.

### 6.3 Sub-muscle enrichment (12 rows) — the slice's systemic issue

The weak model gave every row exactly one sub tag, which misfiles the
big compounds: a user browsing **glutes** (176 rows) would never see a
sumo deadlift, and one browsing **quads** would never see a sumo squat.
Appended (specialty sub stays first — Task 4 precedent):

| Rows | Sub change |
| --- | --- |
| 4 sumo deadlifts (barbell/DB/KB/landmine) | `+legs_glutes` (a sumo pull is a glute/hip hinge first) |
| 5 sumo squats (barbell/DB/KB/landmine/BW) | `+legs_quads +legs_glutes` (a sumo squat is still a squat) |
| 3 curtsy lunges (BW/DB/barbell) | `+legs_glutes` (glute-focused in every coaching context) |

**Deliberately left single-sub**: lateral lunges, cossacks, and the
lateral-step family — their frontal-plane/adductor-or-abductor specialty
tagging is the reason those subs have content, and their training
identity genuinely is the specialty. Documented so Task 13's ranking
doesn't "fix" it backwards.

### 6.4 Fixes

| Id | Fix | Why |
| --- | --- | --- |
| `dip_belt_calf_raise` | eq `[dip_belt]` → `[dip_belt, plate]`; difficulty Advanced → Intermediate | `dip_belt` maps to the free 'Bodyweight' label, so the row was **served to users with no equipment at all** — the tire-flip/pinch-block bug class. Requiring `plate` ('Barbell' label) gates it honestly. The movement itself is a simple calf raise |
| `barbell_sumo_deadlift` | alt `trap_bar` → `dumbbell` | Trap bar frame blocks a sumo stance |
| `sumo_squat` | aliases += "Plie Squat", "Plié Squat" | The plié squat IS the wide-stance squat; only the KB row carried the name. Accented + plain forms cover diacritic-sensitive search |
| `dumbbell_sumo_squat` | aliases += "Dumbbell Plie Squat" | The DB version is the canonical gym "plié squat" |
| `copenhagen_knee_plank` | aliases += "Bench Copenhagen Plank", "Short-Lever Copenhagen Plank" | Absorb from the core retire ("plank" already in the keeper's name → no prescription-type change) |

### 6.5 Coverage adds (2 rows) + cross-stack

The gap survey found the ad/abductor and calf families complete — the
one true hole: **the anterior lower leg existed in no form** (zero
tibialis/shin rows catalog-wide, in the knees-over-toes era).

1. **Tibialis Raise** (`tibialis_raise`) — wall-lean toe raise; aliases
   Tib Raise / Wall Tibialis Raise / Shin Raise; Beginner, bodyweight,
   new `dorsiflexion` pattern (mapped to the 'Squat' filter bucket
   alongside `plantar_flexion` in `MOVEMENT_PATTERN_MAP`).
2. **Heel Walk** (`heel_walk`) — the toe-walk mirror for shin endurance;
   Beginner, bodyweight, `gait` pattern.

Cross-stack: **`adductor_machine` added to the common tier** — the
abductor machine was already common; the pair are equally staple gym
machines and the asymmetry was arbitrary.

Rejected after survey: seated tib-raise machine (niche gear), KB
standing calf raise (DB row + alt covers), single-leg Smith calf raise,
seated band adduction (ball squeezes own the seated isometric slot),
weighted Copenhagen (load progression is plate-on-hip coaching detail,
not a separate row).

### 6.6 Handoffs discovered

- **Task 10 (core)**: `side_plank_clamshell` and
  `side_plank_hip_abduction` are rep movements but the `\bplank\b`
  TIME_HOLD rule serves them as timed holds (both prescription twins).
  The plank-hybrid exclusion list (`row|rotation|reach|drag|dumbbell`)
  needs one considered extension when core settles the plank family —
  not piecemeal edits per slice.
- **Task 12 (consolidation)**: the `dip_belt` under-gating class found
  here has 5 more live members — `weighted_pull_up`,
  `chin_up_weighted_belt`, `weighted_parallel_bar_dip`,
  `weighted_ring_dip`, `cable_belt_squat` — all gate only on their
  bar/rings/cable id while the belt maps to free 'Bodyweight', so
  plate-less users can be served "weighted" rows. Same one-line
  `+plate` fix each, deferred to keep closed slices closed (eval
  re-gate needed when applied).
- **Task 12**: movement-pattern vocabulary sprawl (355 distinct ids,
  dozens of singletons like `short_lever`, `hip_dip`) — inert at
  runtime but worth a normalization pass decision.
- **Task 11 (cardio)**: `lateral_bound` ("Skater Jump") stays a legs
  power row by the same logic that keeps `sled_push` in cardio —
  confirm the jump-family convention when cardio is audited.

### Counts summary (Legs C)

| Item | Count |
| --- | --- |
| Rows reviewed | 100 (34 calves / 33 inner / 33 outer) + 1 cross-group (core Copenhagen) |
| Retired | 2 (retired list 48 → 50) |
| Row fixes | 14 (12 sub enrichments, 1 equipment gate + difficulty, 1 alt list) + 6 alias additions across 4 rows |
| Adds | 2 (catalog 1,332 → 1,334) |
| Cross-stack | `adductor_machine` → common tier; `dorsiflexion` → MOVEMENT_PATTERN_MAP |
| Decisions closed | sumo keeper healthy; lateral sled/step + cossack + multi-hip handoffs verified; single-sub specialty tagging kept for frontal-plane isolations |
| Eval gate | report byte-identical; 50/50 suites (595 tests) |
| Visible after slice | legs 312 (316 in-group), core 187, catalog-wide 1,284 |

## Task 7 — Shoulders (2026-08-10)

> **APPLIED 2026-08-10** (commit `fea347c`, same session as the findings,
> same widened Dylan brief as Tasks 4–6). 9 retires (retired list 59),
> 15 keeper/fix row touches, 2 coverage adds, 2 common-tier adds
> (catalog 1,336; visible 1,277; shoulders in-group 203 / visible 194).
> Gates: 50/50 suites (595 tests), eval captures report
> **byte-identical** to baseline — fourth perfect gate in a row.

**Scope.** All 201 primary-shoulders rows (the plan's 194 estimate
predated the Task 1/3 arrivals): 100 rotator_cuff, 52 front-delt, 26
side-delt, 23 rear-delt, plus a cross-group sweep (which found only the
seven already-retired Task 3 twins and back's live
`cable_lat_ext_rotation_combo` — Task 2 territory, untouched).

**Verdict: the plan's fear was wrong, in an interesting way.** The
⚠️ "100 rows tagged rotator_cuff — likely bulk mis-tagging" warning
assumed presses and raises had been dumped into the cuff sub. In fact
every one of the 100 is a genuine rotator-cuff/scapular-health movement
— a complete physical-therapy library (ER/IR at every angle and
position, Cubans, full-cans, T/W/Y/trap-3 raises, serratus punches and
wall slides, Gerber lift-offs, belly presses, bottoms-up carries, ball
circles). The tagging is honest. The real disease was **cue-twin
farming**: variants that differ from a base row only by a coaching cue
whose "equipment" is free at runtime. The press/raise/rear-delt
families are healthy and near-complete.

### 7.1 Task 1/3 arrivals — all re-verified in place, closed

- `face_pull` (⚠C/T): Beginner, honest copy, common-tier and template
  refs intact.
- `low_cable_pull_apart`: healthy.
- `barbell_upright_row` (⚠C) + `dumbbell_upright_row`: healthy rows,
  but they exposed the upright-row normalization below.
- Landmine presses (Task 1 home = shoulders): all five rows
  (`landmine_press`, `single_arm_landmine_press`, `tall_kneeling…`,
  `half_kneeling…`, `half_kneeling_single_arm…`) verified. The
  `landmine` vs `landmine_attachment` id split is another non-gating
  twin pair (both → 'Machine') — Task 12 hygiene note.

### 7.2 Retires (9) — rotator-cuff cue-twins

Task 5's towel/slider rule applied to the PT library: retire rows that
are **gating-identical** to a keeper (cue gear maps to the free
'Bodyweight' label or is setup equipment) and differ only by a coaching
cue. Keepers absorb the retired aliases.

| Retire | Keeper | Cue |
| --- | --- | --- |
| `band_towel_roll_external_rotation` | `band_standing_external_rotation` | towel pinned at ribs |
| `band_towel_roll_internal_rotation` | `band_standing_internal_rotation` | 〃 |
| `cable_towel_roll_external_rotation` | `cable_standing_external_rotation` | 〃 |
| `cable_towel_roll_internal_rotation` | `cable_standing_internal_rotation` | 〃 |
| `wall_supported_band_45_degree_external_rotation` | `band_45_degree_external_rotation` | back against wall |
| `wall_supported_band_90_90_external_rotation` | `band_90_90_external_rotation` | 〃 |
| `pad_supported_cable_90_90_external_rotation` | `seated_supported_cable_90_90_external_rotation` | same cable+pad setup, near-verbatim copy, standing vs seated |
| `single_arm_medicine_ball_wall_stabilization_circles` | `single_arm_stability_ball_wall_circles` | both ball ids → 'Medicine Ball' label; mutual alternatives |
| `single_arm_forearm_wall_slide` | `single_arm_serratus_wall_slide` | near-verbatim copy; keeper already aliased "Single-Arm Wall Slide" |

Kept-after-scrutiny: the **90/90 vs 45° vs neutral ER angle tiers**
(real PT loading distinctions), half-kneeling variants (position
convention kept catalog-wide), all isometric holds (correctly served as
timed via "hold"/"isometric" name rules), the five-row Gerber lift-off
family, quarterback/thrower's ER (athletic patterns), bottoms-up
carries (correctly timed via the carry rule; their cuff home is
defensible — flagged for Task 10's carry-family-home decision, not
moved), full-can/T/W/Y/trap-3 raises (the unilateral thumb-up PT
versions of scaption — distinct from the front-delt scaption rows),
and the remaining ~50-deep ER/IR × implement × position matrix — real
but deep, handed to **Task 13** to rank (the common tier already
protects typical generation picks).

### 7.3 Upright-row normalization

The family (10 rows) was inconsistent on exactly the axes Task 3
flagged when it sent the two stragglers here:

| Row | Fix |
| --- | --- |
| `barbell_upright_row`, `dumbbell_upright_row`, `resistance_band_upright_row` | Difficulty Beginner → **Intermediate** — the movement is impingement-sensitive and the other seven rows already said Intermediate; beginners still get lateral raises as the priority side-delt pick |
| `barbell_upright_row`, `dumbbell_upright_row` | Pattern `vertical_pull` → `upright_row` — vertical_pull is the pull-up/pulldown stacking family (76 rows); an upright row does not belong in pull-day pattern caps |
| `barbell_upright_row` | Copy "…upper traps and rear deltoids" → "…and side delts" — description contradicted its own (correct) side-delt tags |

Eval stayed byte-identical through the pattern retag (no capture
exercised the vertical_pull cap on these rows).

### 7.4 Difficulty fix + regression-ladder add

`pike_push_up` was **Beginner** — it is meaningfully harder than a
push-up (which is Beginner). Raised to Intermediate, and the gap below
it filled with the classic regression, so the bodyweight vertical-press
ladder now reads **incline pike (B) → pike (I) → handstand push-up
(A)** — the assisted-Nordic pattern from Task 5.

### 7.5 Coverage adds (2 rows) + common tier

1. **Incline Pike Push-Up** (`incline_pike_push_up`) — hands-elevated
   Beginner regression; bodyweight-gated (bench/box are alternatives).
2. **Kettlebell Push Press** (`kettlebell_push_press`) — the KB power
   press existed in no form despite `dumbbell_push_press` offering
   kettlebell as its alternative; Intermediate.

Common tier: **+ `dumbbell_shoulder_press`** (the standing DB press —
the single most standard home shoulder staple — was missing while its
seated version was common) and **+ `pike_push_up`** (bodyweight press
staple; mirrors Task 4's `bodyweight_squat` common-tiering).
Shoulders-focus sessions have **no anchor pool by design**
(`anchor-exercises.ts` returns `[]` for single-group focuses), so no
anchor or enrichment-spec changes.

Rejected after survey: behind-the-neck press (impingement, deliberate
absence), standing DB external rotation (physics-wrong standing —
the catalog correctly has only band/cable/side-lying ER), bilateral
W/full-can rows (the DB scaption row is the bilateral version),
seated lateral-raise machine (machine row covers), KB seated press
permutations.

### 7.6 Handoffs discovered

- **Task 10 (core)**: bottoms-up KB carries live here under
  rotator_cuff — include them in the carry-family-home decision.
- **Task 12**: `landmine` vs `landmine_attachment` id twins (both →
  'Machine'); description templating (several rows share verbatim
  boilerplate descriptions, e.g. three presses with identical copy).
- **Task 13**: rank the ~50-row ER/IR matrix and the wall-slide/
  serratus micro-family — real PT content, but consumer-app depth
  should be a deliberate ranking decision.

### Counts summary (Shoulders)

| Item | Count |
| --- | --- |
| Rows reviewed | 201 (100 cuff / 52 front / 26 side / 23 rear) |
| Retired | 9 (retired list 50 → 59) |
| Row fixes | 6 (3 difficulty, 2 pattern, 1 copy) + alias absorbs onto 9 keepers |
| Adds | 2 (catalog 1,334 → 1,336) |
| Cross-stack | common tier + `dumbbell_shoulder_press`, + `pike_push_up` |
| Decisions closed | rotator-cuff tagging is LEGITIMATE (plan's bulk-mis-tag fear wrong); cue-twin rule extended to PT library; upright rows normalized Intermediate/upright_row; Task 1/3 arrivals verified |
| Eval gate | report byte-identical; 50/50 suites (595 tests) |
| Visible after slice | shoulders 194 (203 in-group), catalog-wide 1,277 |
