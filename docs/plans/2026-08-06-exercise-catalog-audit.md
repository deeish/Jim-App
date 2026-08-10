# Exercise catalog audit — agent execution plan

**Written 2026-08-06 for a future Claude agent.** Dylan's brief: the exercise
catalog was originally generated with a weaker model. Before authoring more
plan templates on top of it, audit every row for correctness, fold in the
known cleanup backlog, and add exercises where coverage demands it
(**policy updated 2026-08-06 — adds are coverage-driven, see Sections 0.5
and 5**). Templates hard-reference catalog ids, generation draws from the
catalog pools, and History attributes logs to catalog ids — quality here
compounds into everything.

**Weighting: ~70% verify-and-fix existing rows, ~30% targeted adds.** A
plausible-but-wrong metadata row actively corrupts plans (wrong equipment
leaks into home programs, wrong muscle corrupts balance passes and body
maps). A missing exercise hurts nobody. Do not bulk-add.

---

## 0. Prime directives (read before anything)

1. **Exercise ids are immutable and permanent.** Workout logs, plan slots,
   saved exercises, and the three shipped plan templates all reference
   `exerciseId`. NEVER rename or delete an id. Fix metadata freely. To retire
   a bad row, follow the established pattern: unmap/retag it out of reach
   (see `cardio-catalog-exclusions.ts` for precedent) — never remove it.
2. **Report → Dylan approves → apply.** Phases 1–4 produce a findings report.
   No catalog edits before he signs off on the report. Apply in slices
   (Phase 5), each slice verified independently.
3. **The eval harness is the safety gate.** Catalog changes ripple into
   generation quality. Every applied slice must keep `cd backend && npm test`
   green (incl. `plans/eval/` suite) and should compare
   `npm run eval:captures:report` scores before/after. Score drops = stop and
   investigate.
4. **Environment traps** (from `.claude/skills/verify/SKILL.md` and memory):
   `backend/.env` points at PRODUCTION Supabase — never run prisma/node
   scripts that read it without overriding env inline. The catalog is a
   **checked-in JSON file, not a DB table** — all changes are ordinary
   file edits + PR. Never edit source files via PowerShell
   Get-Content/Set-Content (mojibake); use the Edit tool. Never use a
   stateful whole-file brace scanner on TS/TSX.
5. Shipping = backend deploy only (catalog loads at service startup). No
   frontend release needed unless display maps / body-map regions change
   (Section 6 flags when they do).

---

## 0.5 Session roadmap & checklist (added 2026-08-06 — Dylan's decisions)

Dylan locked these four decisions on 2026-08-06; they supersede anything
below that conflicts:

1. **Adds are coverage-driven, not template-gap-only.** Each group session
   proposes popular / clearly-good exercises the catalog is missing across
   the equipment spectrum (machines, barbell, dumbbell, cable, kettlebell,
   bodyweight/calisthenics). Every add still states its reason and passes
   the full Section 6 checklist at apply time. The template-gap matrix is
   suspended — no template roadmap exists yet (Dylan, 2026-08-06).
2. **The work is split into per-muscle-group sessions** (big groups
   sub-split by sub-muscle), run one at a time in separate conversations —
   deliberately NOT all at once, so each slice gets full attention.
3. **Each session is end-to-end for its slice**: verify existing rows'
   metadata, propose removals (retire/unmap — NEVER delete ids), propose
   adds. One findings section per group; Dylan approves per group.
4. **Audit is decoupled from templates.** Revisit templates after the
   catalog is clean.

### Standard session procedure (applies to every unchecked task below)

1. Read this plan top-to-bottom first — prime directives, Section 3
   criteria, and Section 6 especially.
2. Re-verify the slice's row list live from the JSON (counts below are
   2026-08-06 snapshots; the catalog may have moved on).
3. Phase-2 judgment pass on **every** row in the slice (Section 3).
4. Removal candidates: id + reason + retire mechanism (Section 0 rule 1).
5. Add candidates: name + draft row sketch + coverage/popularity reason
   (Section 5 quality bar).
6. Adversarially re-check the slice's proposed corrections before they
   enter the report (Section 3, final paragraph).
7. Append a `## <Group>` section to the findings report at
   `docs/audits/2026-08-exercise-catalog-audit-findings.md` (the first
   session to produce findings creates the file), then tick the box below.
8. **Nothing is applied to the catalog until Dylan approves that group's
   findings.** Application happens later in eval-gated slices (Section 7).

### Task checklist

Row counts from the live catalog 2026-08-06 (1,299 total). The suspiciously
round per-sub-muscle counts (biceps 100, triceps 100, rotator cuff 100,
quads 103) suggest the original weak model generated ~100 rows per bucket —
expect filler and near-duplicates, especially in the big groups.

- [x] **Task 0 — Automated integrity sweep** (Phase 1 / Section 2 scripts
      across all groups; mechanical checks only, no judgment; its output
      feeds every later session) — done 2026-08-07, findings in the report.
      Headline: 14 cross-group duplicate pairs (every pair straddles two
      muscle groups — retire calls decide group homes, incl. deadlifts);
      81 rows with invalid `glutes` secondary; 8 unknown equipment ids;
      5 alias-driven wrong timed verdicts; the only video mapping is dead.
- [x] **Task 1 — Chest** — DONE 2026-08-09. Applied in `3be3d41` (15 adds
      + 9 fixes), `ccef300` (cable_pullover retire via the new mechanism),
      and `f32dcc2` (Dylan's §1.3 decisions, all per recommendation:
      A pullover home = back, B landmine presses = shoulders, C rings
      gate as TRX, D bench stays non-gating). Findings §1.6 has the
      close-out details.
      Healthiest slice: rows all legit, gating honest, difficulty sane.
      1 firm retire (cable_pullover = straight-arm pulldown dup), 8 metadata
      fixes, 7 draft adds (knee/wall push-up, squeeze press, TRX press+fly,
      KB floor press, plyo push-up), 4 decisions for Dylan (pullover home,
      landmine home, dip/rings equipment mapping, bench gating).
      **APPLIED 2026-08-07 (`3be3d41`)**: metadata fixes + video rekey +
      15 adds (48 → 63 chest rows; expanded list per Dylan) — all gates
      green. Retire + the 4 decisions remain open.
- [x] **Task 2 — Back A: lats & upper back** (115 rows: `back_lats` and
      `back_lats+back_upper` combos) — done + APPLIED 2026-08-09
      (`ccef300`). The padding hotspot: 22 retires (9 in-slice dups, 3
      cross-group/sub dups, 10 incoherent), 4 prescription fixes, 8
      renames (Inverted Row, Cable Lat Pull-Around, …), 5 adds (Jumping/
      One-Arm Pull-Up, Machine High Row, Front Lever, KB Pullover).
      Built the NON-CARDIO RETIRE MECHANISM (`retired-exercise-ids.ts` +
      spec — hidden from browse/search/generation/replace, still resolve
      by id for history) and remapped functional_trainer → Cable.
      Handoffs recorded in findings §2.3: Back B (yates_row audit +
      Ring Row / Gorilla Row / Elbow-Out DB Row adds,
      barbell_lat_row_elbows_wide arrives re-subbed) and Arms B
      (Barbell Dead Hang grip-vs-back home).
- [x] **Task 3 — Back B: mid/lower back & traps** — done + APPLIED
      2026-08-09 (`a7e1019`). 110 rows (incl. the re-subbed elbows-wide
      row). Low filler, high mis-homing: 21 retires closing ALL eight
      Task 0 deadlift/GM/hip-thrust/carry twin pairs (Dylan: hinge home =
      legs, sumo keeps the legs twin with refs re-pointed, face pulls =
      shoulders) plus eight shoulders-family dups; 11 retags (7 hinge
      rows → legs, 4 rear-delt/upright rows → shoulders); bear_row +
      monkey_row rebuilt (described wrong movements); adds Ring Row +
      Gorilla Row. The Deadlift-home decision is now CLOSED for Legs B —
      its remaining work is verifying the legs-side keepers. Handoffs:
      Legs B/C owns the 45° back-extension glute-vs-erector twin call;
      Shoulders re-verifies the four retagged arrivals; Core/Arms B
      settle the carry-family home (back's third twin retired).
- [x] **Task 4 — Legs A: quads** — done + APPLIED 2026-08-10 (`a75b32e`).
      104 rows (103 pure quads + trap_bar_deadlift, untouched for Legs
      B). Healthiest big slice: zero invented movements, zero in-slice
      dups. Closed Task 0 §0.2 in full (all 81 invalid-glutes rows were
      quads rows: secondary removed + `legs_glutes` sub added, so Legs
      B's slice = hamstrings, or glutes-without-quads). 1 retire
      (`sled_drag_backward`, an uncaught cardio twin of
      `backward_sled_drag`), RFESS renamed "Bulgarian Split Squat",
      2 difficulty fixes, 5 alias adds, 7 coverage adds — headline:
      `bodyweight_squat` (missing catalog-wide!) tiered common + added
      to legs/lower/lower-body/full-body anchor pools, giving
      bodyweight-only users their first reachable leg-day anchor.
      Handoffs: Task 11 (cardio sled section; jumping lunge / wall
      ball / broad jump gaps), Task 13 (rank the
      front-rack/landmine/smith/cable permutation families).
- [x] **Task 5 — Legs B: hamstrings & glutes** — done + APPLIED
      2026-08-10 (`aa4719c`). 98 rows (post-Task-4 slice: hamstrings,
      or glutes-without-quads). All hinge keeper families verified
      clean (RDL/SLDL/deadlift/GM + Task 3 arrivals). 2 retires
      (towel-curl implement twins of the slider rows —
      gating-identical labels), 1 retag ARRIVING (back's
      `reverse_hyperextension` → legs, unifying the reverse-hyper
      family; bench/superman erector rows stay back), Nordic curl made
      home-reachable (nordic_bench was gating it behind 'Machine'),
      GHR pattern hinge→leg_curl, Task 3 copy residue fixed, Machine
      Back Extension renamed. 4 adds — headline: the glute kickback
      existed in NO form (cable + machine versions added, machine via
      existing multi_hip_machine id) + Kas Glute Bridge + Assisted
      Nordic. DECISIONS CLOSED: 45° glute-vs-erector split stays;
      cable/cable_machine + bench/flat_bench + safety_bar id twins are
      label-normalized and non-gating (no migration; Task 12 hygiene
      note); kettlebell_swing_conditioning is a cardio modality row,
      not a twin (Task 11 confirms). Both gates byte-identical/green.
- [x] **Task 6 — Legs C: calves + inner/outer thighs** — done + APPLIED
      2026-08-10 (`b2df0f4`). 100 rows (34/33/33, zero overlap with
      Tasks 4–5 — the compounds were all tagged inner-only). Cleanest
      slice yet: calves saturated across every implement, ad/abductor
      coverage complete. All handoffs closed: sumo keeper verified
      (alt trap_bar→dumbbell nit), cossack + lateral-step + multi-hip
      + lateral-sled families all real and kept. 2 retires
      (`barbell_donkey_calf_raise` — free bar can't be secured in a
      hinge; `bench_copenhagen_plank` — core dup of legs'
      copenhagen_knee_plank, aliases absorbed). 12 sub enrichments
      (sumo DLs +glutes, sumo squats +quads+glutes, curtsy +glutes —
      append-only; lateral/cossack/step stay specialty-tagged),
      dip_belt_calf_raise +plate gate fix (dip_belt maps to free
      Bodyweight — tire-flip class; 5 more class members deferred to
      Task 12: weighted pull-up/chin-up/dips ×2/cable belt squat),
      plié aliases. 2 adds — headline: anterior lower leg existed in
      NO form (tibialis_raise + heel_walk; dorsiflexion pattern
      mapped); adductor_machine joins the common tier beside the
      already-common abductor. Handoffs: Task 10 (side-plank
      clamshell/abduction rep rows served timed by the plank regex),
      Task 12 (dip_belt class + pattern-vocab sprawl), Task 11
      (skater-jump convention). Both gates byte-identical/green.
- [x] **Task 7 — Shoulders** — done + APPLIED 2026-08-10 (`fea347c`).
      201 rows (100 cuff / 52 front / 26 side / 23 rear; the 194
      estimate predated the Task 1/3 arrivals). The bulk-mis-tag fear
      was WRONG: all 100 rotator_cuff rows are genuine PT/prehab
      movements — the disease was cue-twin farming. 9 retires (4
      towel-roll ER/IR, 2 wall-supported band ER, pad-supported cable
      90/90, medicine-ball wall circles, forearm wall slide — each
      gating-identical to its keeper; aliases absorbed). Upright-row
      family normalized: all 10 rows Intermediate (impingement flag
      from Task 3 closed), barbell/DB patterns vertical_pull →
      upright_row, barbell copy de-rear-delted. Pike ladder built:
      pike_push_up → Intermediate + incline_pike_push_up added
      (Beginner regression); kettlebell_push_press added (KB power
      press existed in NO form). Common tier + dumbbell_shoulder_press
      (standing staple was missing!) + pike_push_up. Task 1/3 arrivals
      (face_pull, low_cable_pull_apart, both upright rows, 5 landmine
      presses) all re-verified in place. Shoulders-focus has no anchor
      pool by design → zero anchor churn. Handoffs: Task 10 (bottoms-up
      carries in the carry-home decision), Task 12
      (landmine/landmine_attachment id twins; description templating),
      Task 13 (rank the ~50-row ER/IR matrix). Both gates
      byte-identical/green. Shoulders visible 194 (203 in-group);
      catalog 1,336, retired 59.
- [x] **Task 8 — Arms A: biceps & triceps** — done + APPLIED 2026-08-10
      (`3bafb8b`). 200 rows (100/100). Most saturated slice audited —
      zero invented movements, zero coverage gaps, FIRST slice with no
      adds (PJR/JM/Tate/rolling/Bayesian all real). HEADLINE: 2 rows
      were DEAD at runtime — iso_lateral_curl_machine +
      seated_dip_machine were missing from EQUIPMENT_MAP (→ Unmodeled
      sentinel, never available to anyone); both now map 'Machine',
      reviving the rows. 5 retires: single_arm_face_away_cable_curl
      (IS the Bayesian curl), 3 wall-strict clones (wall = free
      anti-cheat cue, verbatim instructions; barbell row survives as
      the competed Strict Curl + aliases), ring_triceps_extension
      (rings gate as TRX, 1.3-C). Gate fixes: weighted dips ×2 +plate
      (in-slice dip_belt class members; Task 12 list now
      weighted_pull_up + chin_up_weighted_belt + cable_belt_squat).
      Common tier + parallel_bar_dip + close_grip_push_up (bodyweight
      triceps staples missing). Handoffs: Task 9 verifies the
      hammer/reverse/Zottman→forearms split; Task 13 ranks the
      alternating long tail + curl-position matrix; Task 12
      single_handle/single_handle_attachment id twins. Both gates
      byte-identical/green. Catalog 1,336; retired 64; visible 1,272.
- [ ] **Task 9 — Arms B: forearms & grip** (~100 rows; retire-heavy —
      owns the ~12 grip-sport specialty rows from Section 4)
- [ ] **Task 10 — Core** (189 rows; ⚠️ 94 tagged `core_deep` — same
      bulk-tagging suspicion as shoulders)
- [ ] **Task 11 — Cardio** (50 rows; ALL 50 empty-subMuscle rows in the
      catalog are cardio — decide by-design vs backfill here; also check
      `cardio-catalog-exclusions.ts` / `cardio-display-order.ts`)
- [ ] **Task 12 — Consolidation** (merge per-group findings, cross-group
      consistency + dedup pass, final decisions list for Dylan, then the
      Section 7 apply plan: 3 eval-gated PRs)
- [ ] **Task 13 — Exercise quality ranking** (added by Dylan 2026-08-07,
      runs AFTER everything else): give every exercise row an overall
      how-good-is-it ranking. Scope to define with Dylan when we get
      there: field name + scale, criteria (effectiveness, safety,
      accessibility, popularity), and what consumes it (browse ordering,
      generation pool priority, replace-picker bias — likely interacts
      with/supersedes the common-exercise-ids tiers). Rows added during
      earlier tasks (e.g. the 15 chest adds) get ranked here too.

## 1. Ground truth — the files

**The catalog itself:**
- `backend/data/exercises_5000plus.json` — 1,299 rows (2026-08-06). THE file
  under audit.
- `backend/data/exercise-videos.json` — `youtubeId` pipeline (currently ~1
  mapping; do not expand as part of this audit).

**Row schema** (verified against live data 2026-08-06):

```jsonc
{
  "id": "standing_barbell_curl",        // snake_case, IMMUTABLE
  "name": "Standing Barbell Curl",      // display name
  "aliases": [],                        // search synonyms
  "description": "…",                   // one sentence
  "primaryMuscleGroupId": "arms",       // chest|back|legs|shoulders|arms|core|cardio
  "subMuscleIds": ["arms_biceps"],      // see SUB_MUSCLE_MAP; 50 rows empty (ALL cardio — likely by design)
  "secondaryMuscleGroupIds": ["shoulders"],
  "equipmentIds": ["barbell"],          // REQUIRED gear — this list gates generation pools
  "equipmentAlternativeIds": ["ez_bar", "cable_machine"],  // substitutes; NOT gating
  "movementPatternIds": ["curl", "elbow_flexion"],
  "type": "Isolation",                  // Compound | Isolation (only these two)
  "position": "Standing",               // 16 values incl. Seated, Lying, Hanging, Other…
  "isUnilateral": false,
  "difficulty": "Beginner",             // Beginner | Intermediate | Advanced
  "instructions": ["…", "…"]            // 3–5 imperative steps
}
```

**Files that interpret or reference catalog data — the cross-consistency
surface. Any change must be checked against ALL of these:**

| File | Role |
| --- | --- |
| `backend/src/data/exercise-mappings.ts` | id→display maps: `PRIMARY_MUSCLE_GROUP_MAP`, `SUB_MUSCLE_MAP`, `EQUIPMENT_MAP` (151 equipment ids → display names). An id used in the JSON but missing here renders raw or breaks filters. |
| `backend/src/data/exercise-prescription.ts` | `inferPrescriptionTypeFromRawExercise` — name/pattern regexes deciding reps vs time. **Twin file** `frontend/src/lib/exercisePrescription.ts` (TIME_HOLD_NAME, CARRY_OR_LOADED_WALK, CARDIO_MODALITY_NAME) must stay in sync. |
| `backend/src/data/common-exercise-ids.ts` (+spec) | Staple/niche tiers ordering generation pools and browse popularity. A new pickable exercise that isn't tiered sorts last. |
| `backend/src/data/anchor-exercises.ts` | Slot-1 anchor candidates (compounds-only, home-capable options). |
| `backend/src/data/movement-pattern-fillins.ts` (+spec) | Pattern-gap fill-in pools (week floors, pull-balance inserts). |
| `backend/src/data/cardio-catalog-exclusions.ts`, `cardio-display-order.ts` | Cardio row gating/ordering — also the retire-pattern precedent. |
| `backend/src/data/muscle-preview-tags.ts`, `set-rep-schemes.ts`, `program-templates.ts` | Preview tags; goal×role rep bands; generated program structures. |
| `backend/src/data/plan-templates/*.ts` | The three shipped templates — reference exercise ids directly. `plan-templates.catalog.spec.ts` already enforces id integrity; keep it green. |
| `backend/src/exercises/exercise-search.util.ts` (+golden specs) | Gym-speak aliases (OHP, Skullcrusher…) and search ranking. `exercises.service.search.spec.ts` runs against the real catalog. |
| `backend/src/exercises/exercises.service.ts` | `exerciseFamily`/groupKey (strips equipment words → variant grouping in the UI), popularity ranking, `withDerived`. |
| `frontend/src/lib/exerciseToHighlights.ts` + `components/bodymap/` | subMuscleIds → body-map regions. A NEW subMuscleId requires a body-map region + `SUB_MUSCLE_MAP` entry, or tiles/filters silently degrade. |
| `frontend/src/screens/GeneratePlanScreen.tsx` equipment map | Historical bug 4.7: equipment ids missing from this map dead-ended bodyweight-only onboarding. Any new equipment id must be threaded here + `constants/` equipment enums. |

---

## 2. Phase 1 — automated integrity sweep (scripts, no judgment)

Write throwaway Node scripts (scratchpad, not committed) against the JSON.
Every check outputs violating row ids. Expected checks:

1. **Referential integrity**: every `primaryMuscleGroupId`, `subMuscleIds[*]`,
   `equipmentIds[*]`, `equipmentAlternativeIds[*]` resolves in the
   corresponding map in `exercise-mappings.ts`. Unknown id = finding.
2. **Enum conformance**: `type` ∈ {Compound, Isolation}; `difficulty` ∈
   {Beginner, Intermediate, Advanced}; `position` ∈ the observed 16;
   `isUnilateral` boolean; instructions 3–5 non-empty strings.
3. **Uniqueness**: no duplicate ids; no duplicate names (case/punctuation-
   insensitive); flag near-identical names that `exerciseFamily` would merge
   vs. ones it wouldn't (position words are deliberately kept distinct —
   seated vs standing OHP is a KNOWN accepted near-pair, see future.md
   "Position-variant redundancy" before flagging).
4. **Naming lint**: em-dash qualifiers (standard is parentheses — future.md:
   "Swimming — Easy Laps" class), trailing whitespace, inconsistent
   capitalization, id↔name drift (id says incline, name says flat).
5. **subMuscle coverage**: rows with empty `subMuscleIds` (50 as of today —
   verified 2026-08-06: ALL 50 are cardio, so this is likely by design) —
   non-cardio empties, if any appear, fall back to whole-group body-map
   highlights and are invisible to sub-muscle filter chips.
6. **Sanity crosses**: `primaryMuscleGroupId: cardio` rows with rep-style
   patterns; timed-name rows (`plank|hold|carry|hang…`) whose inferred
   prescription type comes out `reps` (run them through
   `inferPrescriptionTypeFromRawExercise` and diff against the frontend
   twin's verdict); `secondaryMuscleGroupIds` containing the primary;
   `equipmentAlternativeIds` overlapping `equipmentIds`.
7. **Cross-file orphans**: ids referenced by `common-exercise-ids`,
   `anchor-exercises`, `movement-pattern-fillins`, plan templates, or
   `exercise-videos.json` that don't exist in the catalog (specs cover some
   of this — run them, then close the remainder).

## 3. Phase 2 — model review sweep (the judgment pass)

Batching is defined by the Section 0.5 task checklist (one session per
task; arms/legs/back sub-split by sub-muscle). For each row, judge:

- **Required equipment realism** — the load-bearing check. `equipmentIds` is
  what gates generation pools (required-only filtering, fixed 2026-07-09).
  A row requiring gear it doesn't need pollutes home plans; a row missing
  required gear escapes filtering. Alternatives belong in
  `equipmentAlternativeIds`, which must list genuine substitutes only —
  this is how axle_bar→Barbell leaked grip-sport rows into normal plans.
- **Muscle assignments** — primary correct? (Deadlift split: Conventional
  under legs, Sumo under back — Dylan's standing decision leans "recommend
  Legs for both", confirm before re-tagging.) Secondaries real, not
  aspirational? subMuscles the right subset?
- **Type** — Compound/Isolation drives accessory ordering and trim logic;
  weak-model mislabels here are likely (e.g. Tate Press escaped the
  isolation guard — future.md "Isolation guard misses odd names").
- **Difficulty + skill/impact** — beginner plans currently receive pull-ups,
  double-unders, plyo jumps (future.md "Experience/skill gating"). Flag every
  high-skill/high-impact row graded Beginner; the audit report should propose
  the grade AND note rows that need a future skill/impact tag when that
  gating lands.
- **Prescription-type edge cases** — weighted carries, holds, sled work must
  come out timed; rep-named cardio must not.
- **Copy quality** — description one clean sentence; instructions imperative,
  accurate, no pipeline jargon; aliases cover common gym-speak the search
  golden specs don't already handle.
- **Duplicate/variant relationships** — should this row group with its family
  in the UI (equipment-word variants) or stand alone (position variants)?

Verify a sample of each batch's proposed corrections adversarially (a second
pass or second agent trying to REFUTE each correction) before it enters the
report — a wrong "fix" is worse than the original error. If Dylan wants the
parallel version, he can say "use a workflow" — batches per muscle group with
an adversarial verify stage fit that shape exactly; otherwise run
sequentially.

## 4. Phase 3 — fold in the known backlog

From `docs/future.md` (Catalog data + watch list) — confirm each against
current code, then include in the report with proposed dispositions:

- ~12 grip-sport specialty rows (axle bar, blobs, grippers) reachable via
  equipment alternatives → retag/unmap.
- Deadlift muscle-group home (see above).
- subMuscles backfill for the 50 empty rows — verified 2026-08-06: all 50
  are cardio, so this is probably by design, not a backlog. Decide in the
  Cardio session (Task 11), don't backfill blindly.
- Display-name qualifier standardization (parentheses, not em-dashes).
- Bench-not-modeled-as-equipment: `SETUP_EQUIPMENT_IDS` deliberately never
  gates benches, so home plans can prescribe Flat DB Bench Press (floor press
  is the coach-true sub). This is a DECISION for Dylan, not a silent fix —
  present options.

## 5. Phase 4 — gap analysis (the source of adds)

**Policy updated 2026-08-06 (Dylan): adds are coverage-driven.** No template
roadmap exists yet, so the original template-gap matrix is suspended. Each
group session instead proposes exercises the catalog is missing that are
popular or clearly high-quality, surveyed across the equipment spectrum:
machines (pin-loaded and plate-loaded), barbell, dumbbell, cable, smith,
kettlebell, and bodyweight/calisthenics.

Quality bar per candidate add:

- **Names its reason**: a widely-known staple whose absence would surprise a
  gym-goer, or it fills a real movement-pattern × equipment × difficulty
  cell that has no quality, correctly-tagged option today.
- Uses EXISTING equipment ids and subMuscle ids wherever possible — new ones
  are cross-stack changes (Section 6 rules 3–4).
- The ~70/30 verify-vs-add weighting still holds overall. A missing exercise
  hurts nobody; do not bulk-add.

Generation's needs (anchor pools, pattern fill-ins, cardio modalities per
equipment) remain a valid demand source alongside popularity. If/when Dylan
defines a template roadmap, re-run this phase as the original per-program
matrix on top of the coverage adds.

## 6. Adding an exercise — the complete checklist

Every add in the applied slice must satisfy ALL of this:

1. **Id**: snake_case, descriptive, globally unique, never recycled from a
   retired row. It is forever.
2. **Every schema field populated** per Section 1 — including 3–5 instruction
   steps, one-sentence description, `position`, `isUnilateral`.
3. **Equipment**: `equipmentIds` = genuinely required gear only, using
   EXISTING equipment ids wherever possible. A brand-new equipment id is a
   cross-stack change: `EQUIPMENT_MAP` (backend), frontend equipment
   constants, the GeneratePlanScreen equipment map (bug-4.7 class), and
   filter UI — avoid unless the template roadmap demands it, and flag it
   loudly in the PR if so.
4. **Muscles**: primary from the 7 canonical groups; `subMuscleIds` REQUIRED
   for non-cardio adds (no new empty-subMuscle rows) and only from
   `SUB_MUSCLE_MAP`. A new subMuscleId is a cross-stack change (map + body-
   map region + filter chips) — same rule as new equipment.
5. **Prescription type**: run the name through BOTH
   `inferPrescriptionTypeFromRawExercise` (backend) and
   `exerciseUsesTimeDisplay` (frontend). If a timed movement isn't caught by
   the name regexes, either adjust the name to a recognized form or extend
   both regex twins together (+ their specs).
6. **Family/grouping**: check `exerciseFamily` output — does the new row
   group under an existing headline variant as intended, or accidentally
   merge with an unrelated family?
7. **Tiering**: decide `common-exercise-ids.ts` placement (staple / niche /
   absent). Untier ed rows sort last in pools and browse — that's a choice,
   make it consciously. Update the spec.
8. **Pool eligibility**: should it join `anchor-exercises.ts` (compounds
   only) or any `movement-pattern-fillins` pool? If cardio: check
   `cardio-catalog-exclusions.ts` / `cardio-display-order.ts`.
9. **Search**: add gym-speak aliases (row `aliases` first;
   `exercise-search.util.ts` only for global synonyms). Re-run the search
   golden specs — new rows can shift rankings.
10. **Skill gating**: difficulty graded honestly; note high-skill/high-impact
    rows for the future gating item.
11. **Tests**: all backend specs green (`exercise-mappings.spec`,
    `common-exercise-ids.spec`, `movement-pattern-fillins.spec`, search
    goldens, `plan-templates.catalog.spec`); frontend `npm run lint` + jest
    if any twin-regex or map changed.
12. **Eval**: fresh generation drives with `GENERATION_CAPTURE=1` against a
    LOCAL backend (never prod env), then `npm run eval:captures:report` —
    validator-ok rate and mean total are the regression signals. New rows
    appearing in generated plans should be spot-checked for coach-sensibility.

## 7. Deliverables

1. **Findings report** (`docs/audits/<date>-exercise-catalog-audit.md`):
   - Per-row corrections table: id · field · current · proposed · evidence ·
     severity (data-corrupting / user-visible / cosmetic).
   - Retire/unmap list with mechanism per row.
   - Decisions needed from Dylan (Deadlift home, bench gating, any new
     equipment/subMuscle ids).
   - Gap matrix + proposed adds (full draft rows, checklist-ready).
   - Counts summary. Nothing applied yet.
2. **After approval, apply in 3 separate PRs**, each eval-gated:
   metadata corrections → retires/unmaps + naming → adds.
3. One combined What's New line only if anything is user-visible in search
   (per release-notes convention: one entry per build, no em-dashes).

## 8. Do-not list

- Do NOT rename/delete ids, ever. Do NOT "clean up" the JSON's field order
  or formatting wholesale (diff noise buries the real changes).
- Do NOT add rows outside the Phase-4 matrix.
- Do NOT touch `exercise-videos.json` scope.
- Do NOT edit both prescription-regex twins asymmetrically.
- Do NOT trust this plan's row counts/line numbers blindly — re-verify
  against the working tree at execution time (catalog may have moved on).
