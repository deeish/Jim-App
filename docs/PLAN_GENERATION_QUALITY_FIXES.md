# Plan Generation — Workout Quality Fixes (pre-launch)

**Created:** 2026-06-02 · **Reviewed against code:** 2026-06-02 (second pass — see "Verification notes")
**Owner:** Dylan
**Status:** Planning — this is the **last quality gate before buying the Apple Developer account** and shipping to TestFlight.
**Source of evidence:** local capture `backend/logs/generation-captures/generation-1780442571106-6181c27c.json` (real 3-week, 12-session plan, 2026-06-02). Goal `hybrid`, experience `advanced`, detail `detailed`, gym, Upper/Lower 4-day split.

---

## Guiding constraint — FREE Groq tier (token verdict: ✅ optimal)

Every fix below is **deterministic, server-side post-processing**. **None adds a Groq call or enlarges a prompt.** A 3-week plan currently costs **2 Groq calls total** (week 1 generated; weeks 2–3 cloned + progressed with no LLM — confirmed: `meta.groq.groqCalls = 2`). All fixes preserve that; one (lower exercise-count target) slightly *reduces* completion tokens.

**Why not fix this in the prompt?** On the free tier we can't rely on a 70B model obeying instructions and can't afford a retry to fix a bad session. Deterministic code *guarantees* the rule; a prompt only *requests* it. So: **the LLM proposes, code disposes.** This is the token-optimal choice, not a compromise.

---

## Summary (revised after code review)

| # | Issue | Severity | Root cause (file) | Recommended fix | Effort |
|---|-------|----------|-------------------|-----------------|--------|
| 2 | Progression over-inflates volume (+25% not +8%) | High | `Math.ceil` at `plans.service.ts:613` | **`ceil`→`round`** (one line) | XS |
| 5 | Cardio shown as "5 × 11" | Medium (user-visible) | LLM-placed `time` rows keep strength `sets`/`reps`; clean finisher append is skipped when a cardio row already exists (`session-enrichment.ts:844`) | Coerce **all** cardio/`time` rows to the canonical `sets:1, reps:600, type:'time'` shape | S |
| 3 | Split integrity broken — legs on Upper days, chest on Lower days | High | Purity pass is upper-only **and** Squat/Hinge-only — misses lunges + every Lower day (`generation-chunk-repair.ts:450-495`) | Replace with **one bidirectional purity pass keyed on `primaryMuscleGroup`** | M |
| 1 | Per-session volume too high (24→30→33 sets) | High | No total-set cap; high `exerciseTargetsForSession` tier + flat scheme | **Lower source targets** (scheme + exercise count) **+ simple per-session total-set clamp** | M |
| 4 | Redundant selection (3–4 hinge variants/session) | Low (optional) | No per-session pattern cap; partly a dedup side effect | Make cross-week dedup pattern-aware *or* a light cap pass — **defer, not launch-blocking** | M |

Ordered by recommended implementation sequence (easiest/highest-confidence first). Severity = impact on a knowledgeable user's trust at first open.

---

## Verification notes (what the second code pass confirmed or changed)

- **Issue 5 is user-visible, not just ugly data.** `frontend/src/lib/workoutExerciseDisplay.ts:55,72` formats a time row as `` `${sets} × ${duration}` `` — so `sets:5` on a treadmill row renders literally as "5 × …". The canonical *good* shape already exists in the appended finisher (`session-enrichment.ts:887-908`: `sets:1, reps:600` → "10 min"). The bug surfaces only when the **model places its own cardio row**, which makes `shouldAppendHybridCardioFinisher` skip the clean append (`:844-848`).
- **Issue 3 fix changed.** The current `runUpperPatternPass` only swaps **Squat/Hinge** off **upper** titles (`:462,473`). It misses **lunges** (capture: *Barbell Curtsy Lunge / Forward Lunge on "Upper-A/B"*) and has **no lower-day coverage at all**. So the fix is **not** "mirror the narrow pass" — it's one **bidirectional** pass on `primaryMuscleGroup` (Legs off upper; Chest/Back/Shoulders/Arms off lower). Reuse existing helpers (`LOWER_PATTERN_NAME:59`, `PULL_NAME:49`, `sessionTitleIsUpperEmphasis:89`) and `library.findOne(id).primaryMuscleGroup`.
- **Cloned weeks are covered.** `repairChunkGeneratedSessions` runs per-chunk (week 1) **and** merged across all weeks when `chunks>1` (`plans.service.ts:1679`); `applySessionEnrichment` always runs (`:1704`). So purity/variety go in the repair pass, volume/cardio-normalize go in enrichment — both reach weeks 2–3.
- **Issues 2 simplified** to a one-line change; **Issue 4 deprioritized** to optional.

---

## Issue 2 — Progression over-inflates volume  ·  **fix first (XS)**

**Symptom:** wk1 = 4 sets/exercise, wk2 = **5** (intended +8%, got +25% on every exercise).

**Root cause:** `PlansService.tryCloneAndProgress` (`backend/src/plans/plans.service.ts:610-615`):
```ts
sets: Math.max(1, prog.volumeMultiplier >= 1
  ? Math.ceil(ex.sets * prog.volumeMultiplier)   // ceil(4 × 1.08) = 5  ← the bug
  : Math.floor(ex.sets * prog.volumeMultiplier)),
```

**Fix (the whole thing):** `Math.ceil` → `Math.round` (and `Math.floor`→`Math.round` for symmetry on deloads). Then `round(4×1.08)=4`, `round(4×1.16)=5` → a 4-set base ramps 4/4/5 instead of 4/5/5.

**Conscious consequence:** with `round`, a *low* base (e.g. 3 sets after Issue 1) won't add a set until the multiplier hits ~1.17, so short programs progress via **intensity + reps** (which already ramp) rather than set count. That is correct, not a regression — adding sets is not the only valid progression.

**De-scoped (don't build now):** "distribute the +delta to top compounds" and "soften the multipliers." `round` alone resolves the artifact; the multipliers in `frontend/src/lib/planGenerationSummary.ts:28-56` are fine once rounding is sane.

**Risk:** ~none. **Token cost:** none (cloned weeks never call Groq).

---

## Issue 5 — Cardio prescribed as "sets × reps"  ·  **fix second (S)**

**Symptom (capture):** "Treadmill Incline Walk: 4×12", "Assault / Air Bike: 5×11" — `prescriptionType:'time'` but strength-style `sets`/`reps`. Renders as "5 × 11" (`workoutExerciseDisplay.ts:55`).

**Root cause:** only the *appended* hybrid finisher is normalized (`session-enrichment.ts:887` → `sets:1, reps:600`). When the **model** already put a cardio row in the body, the append is skipped (`:844-848`) and that row keeps its invented `sets`/`reps`.

**Fix:** in enrichment (after the finisher logic, over every session), normalize **any** row where `prescriptionType === 'time'` **or** `primaryMuscleGroup === 'Cardio'` to the canonical shape: `sets = 1`, `reps = 600` (or convert a sub-60 value to a sane minute bout), `prescriptionType = 'time'`. Reuse the exact contract the appended finisher already uses. Also **exclude these rows from working-set totals** (feeds Issue 1) and **from the purity swap** (Issue 3 must not "repair" a legitimate finisher off a lower day).

**Risk:** Low. **Frontend check:** `formatExerciseRepsDisplay` already converts `reps>=60` → "N min" for time rows, so `reps:600` renders "10 min". Add a lib test.

---

## Issue 3 — Split integrity broken  ·  **fix third (M) — highest credibility win**

**Symptom (capture):** Friday "Lower-B" → **Flat Barbell Bench Press**; "Lower-B" → **Dumbbell Fly**; *and* "Upper-A/B" → **Curtsy / Forward Lunge** (Legs).

**Root cause:** `runUpperPatternPass` (`backend/src/plans/generation-chunk-repair.ts:450-495`) fires only on upper titles and only removes Squat/Hinge `movementPatterns` — so it misses lunges on upper days and does nothing for lower days.

**Fix — replace it with one bidirectional `runFocusPurityPass`:**
- Classify each session's focus from its title: `sessionTitleIsUpperEmphasis(spec.title)` (exists) and a new `sessionTitleIsLowerEmphasis` (mirror; "lower", "leg(s)", "quad", "glute", "posterior", "lower-a/b"). Sessions that are clearly neither (full-body, "AI decide", PPL push/pull ambiguity) are **left alone** — they're allowed mixed movements.
- For an **upper** session, any row whose `library.findOne(id).primaryMuscleGroup === 'Legs'` is swapped (via the existing `pickWithEquipmentTiers`) for an upper movement. For a **lower** session, any row whose `primaryMuscleGroup ∈ {Chest, Shoulders, Back, Arms}` is swapped for a lower movement.
- **Skip cardio/`time` rows** (the hybrid finisher legitimately sits on any day).
- **Fallback:** if no valid replacement is found, leave the row rather than empty the slot (same as the current pass).

Keyed on `primaryMuscleGroup`, this is strictly more correct than the current pattern-only check and removes ~40 lines of narrow logic.

**Risk:** Low–Medium. Add invariant tests: "no Legs row on an upper-titled day," "no upper row on a lower-titled day." **Token cost:** none (library swaps).

---

## Issue 1 — Per-session volume too high  ·  **fix fourth (M) — the headline**

**Symptom (capture):** flat 4/5/5 sets × 6–7 exercises = **24 / 30 / 30–33 working sets/session**; wk3 Tue had ~7 leg lifts (~30 leg sets in one day).

**Root cause:** sets (per exercise, `set-rep-schemes.ts` hybrid/advanced = 4–5) and exercise count (`exerciseTargetsForSession`, `workout-generator.service.ts:53-70`; detailed + >55 min → min 7, "7-10") are chosen independently with **no cap on their product**.

**Fix (phased — source first, clamp as guarantee):**
1. **Lower the source targets** (cheapest, slightly fewer tokens):
   - `exerciseTargetsForSession` detailed top tier `7-10`/min 7 → about **`6-8`/min 6**; mid tier stays.
   - Optionally trim `hybrid`/`advanced` scheme `setsMax` 5 → 4 (the model already picked the low end). The model usually respects the prompt range, so this does most of the work.
2. **Deterministic per-session total-set clamp** (the guarantee), in the same final enrichment pass as Issue 5: compute working sets (exclude cardio/`time`), and while over an experience-scaled cap (e.g. beginner 14 / intermediate 18 / advanced 22), remove one set from the highest-set **non-anchor** exercise (floor 2). Runs on all weeks (post-merge), so cloned weeks are capped too.

**Deferred (phase 2, only if needed):** per-muscle-group cap and accessory-aware trimming. The simple total clamp already bounds the worst case; add granularity later if captures still look lopsided.

**Heads-up:** changing `exerciseTargetsForSession` will shift `plans/eval/` golden expectations — update the goldens/invariants in the same PR.

**Risk:** Low (clamp only ever removes sets). **Token cost:** neutral-to-negative.

---

## Issue 4 — Redundant within-session selection  ·  **optional, not launch-blocking**

**Symptom (capture):** wk3 Tue: RDL + Single-Leg RDL + Stiff-Leg DL; wk1 Fri: Sumo + Conventional DL.

**Root cause:** dedup only matches **identical** ids; three *different* hinges aren't duplicates. Notably this clusters in **cloned+deduped** weeks — the cross-week dedup swaps for week-to-week variety without within-session pattern awareness, so it can *create* pattern clusters.

**Recommended (defer):** rather than a brand-new pass, make the existing dedup swap **pattern-aware** — when it picks a replacement, prefer one whose `movementPattern` is under-represented in the target session (cap ~2 per pattern). Fold into the dedup work later. **This is a polish item; ship the first four fixes and a TestFlight build without it.**

---

## Implementation order & placement

1. **Issue 2** — `ceil`→`round` in `tryCloneAndProgress` (`plans.service.ts:613`).
2. **Issue 5** — cardio/time normalization in `applySessionEnrichment` (always runs, all weeks).
3. **Issue 3** — replace `runUpperPatternPass` with bidirectional `runFocusPurityPass` in `generation-chunk-repair.ts` (runs per-chunk + merged).
4. **Issue 1** — lower `exerciseTargetsForSession` tier + per-session total-set clamp (clamp in the same enrichment pass as #2).
5. **Issue 4** — *optional*, after a build is in testers' hands.

Each step: `cd backend && npm run lint && npm test` (keep `plans/eval/` golden + invariant specs green; extend them with the new invariants). One small commit per step.

## How to verify (re-run the local capture)
- Per-session working sets ≤ cap (advanced ≤ 22); no week jumps +1/exercise.
- **Zero** Legs rows on upper-titled days and zero upper rows on lower-titled days.
- Every cardio/`time` row: `sets:1`, renders as "N min".
- `meta.groq.groqCalls` still ≈ **2** for a 3-week plan (no added LLM cost).

## Out of scope (post-launch)
- Per-exercise set differentiation by role (compound 4 / accessory 3 / isolation 2).
- Session duration-estimate vs prescribed-volume reconciliation (`estimateWorkoutMinutes.ts`).
- Any prompt-level nudges (kept as non-load-bearing polish only).
