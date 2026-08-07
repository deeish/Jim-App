# Exercise catalog audit — agent execution plan

**Written 2026-08-06 for a future Claude agent.** Dylan's brief: the exercise
catalog was originally generated with a weaker model. Before authoring more
plan templates on top of it, audit every row for correctness, fold in the
known cleanup backlog, and add exercises **only** where the template roadmap
shows a real gap. Templates hard-reference catalog ids, generation draws from
the catalog pools, and History attributes logs to catalog ids — quality here
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
  "subMuscleIds": ["arms_biceps"],      // see SUB_MUSCLE_MAP; 50 rows currently empty
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
5. **subMuscle coverage**: rows with empty `subMuscleIds` (50 as of today) —
   these fall back to whole-group body-map highlights and are invisible to
   sub-muscle filter chips.
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

Batch rows by `primaryMuscleGroupId` (7 batches, ~50–350 rows each; split
Legs/Back further if needed). For each row, judge:

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
- subMuscles backfill for the 50 empty rows (prioritize popular exercises).
- Display-name qualifier standardization (parentheses, not em-dashes).
- Bench-not-modeled-as-equipment: `SETUP_EQUIPMENT_IDS` deliberately never
  gates benches, so home plans can prescribe Flat DB Bench Press (floor press
  is the coach-true sub). This is a DECISION for Dylan, not a silent fix —
  present options.

## 5. Phase 4 — gap analysis (the ONLY source of adds)

Build the demand matrix from, in order: (1) the template roadmap Dylan names
when kicking this off (ask; e.g. dumbbell-only home, kettlebell block,
bodyweight progression program), (2) generation's needs (anchor pools,
pattern fill-ins, cardio modalities per equipment), (3) nothing else.

For each planned program: movement pattern × equipment × difficulty grid.
A cell lacking a quality, correctly-tagged option = a candidate add. The
report lists candidates with the cell they fill. No cell, no add.

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
