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
