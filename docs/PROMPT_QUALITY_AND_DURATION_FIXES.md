# Prompt Quality, Duration Fixes & Model-Agnostic Architecture

**Status:** Planned — not yet implemented.  
**Related:** [PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md](./PLAN_GENERATION_TOKEN_AND_QUALITY_PLAN.md) (previous token/quality work)

**Goals:**
1. Extract maximum generation quality from free-tier Groq (llama-3.3-70b)
2. Structure prompts and API layer so switching to any other model (Claude, GPT-4) requires **zero prompt changes** — only a config update
3. Fix the duration display mismatch
4. Free up tokens where they're wasted so freed budget goes to quality context

---

## Honest Quality Assessment

After all changes in this plan, the system will go from roughly **50% as good** as a frontier LLM (Claude/GPT-4) asked directly, to roughly **70–75%**. The remaining gap comes from:
- **Model reasoning ceiling** — llama-3.3-70b is capable but not GPT-4/Claude-level for multi-step fitness programming
- **Single-shot generation** — a real LLM conversation is iterative; this system has one shot
- **Catalog constraint** — exercises are limited to the library; frontier LLMs would pick freely

Upgrading the model config (Part A below) is designed so that gap closes automatically when you switch.

---

## Part A: Model-Agnostic Architecture (Do This First)

**Why first:** Every other change in this plan should land in model-agnostic prompt text and config-driven API calls. If you wire the config layer first, the model swap is genuinely one line.

### A1. Create a `ModelConfig` registry
**File to create:** `backend/src/workouts/model-config.ts`

```typescript
export interface ModelConfig {
  modelId: string;
  provider: 'groq' | 'anthropic' | 'openai';
  batchMaxTokens: { detailed: number; simple: number };
  sessionMaxTokens: { detailed: number; simple: number };
  temperature: { batch: number; session: number; polish: number };
  /** Whether the provider supports a native JSON mode (Groq/OpenAI do; raw Claude does not). */
  supportsJsonMode: boolean;
}

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'llama-3.3-70b-versatile': {
    modelId: 'llama-3.3-70b-versatile',
    provider: 'groq',
    batchMaxTokens: { detailed: 4096, simple: 3200 },
    sessionMaxTokens: { detailed: 3072, simple: 2400 },
    temperature: { batch: 0.73, session: 0.62, polish: 0.45 },
    supportsJsonMode: true,
  },
  'claude-sonnet-4-6': {
    modelId: 'claude-sonnet-4-6',
    provider: 'anthropic',
    batchMaxTokens: { detailed: 6000, simple: 4000 },
    sessionMaxTokens: { detailed: 4096, simple: 3000 },
    temperature: { batch: 0.7, session: 0.6, polish: 0.4 },
    supportsJsonMode: false, // use system prompt instruction instead
  },
  'gpt-4o': {
    modelId: 'gpt-4o',
    provider: 'openai',
    batchMaxTokens: { detailed: 6000, simple: 4000 },
    sessionMaxTokens: { detailed: 4096, simple: 3000 },
    temperature: { batch: 0.7, session: 0.6, polish: 0.4 },
    supportsJsonMode: true,
  },
};

/** Resolved from WORKOUT_MODEL env var, falls back to llama. */
export function getActiveModelConfig(): ModelConfig {
  const id = process.env.WORKOUT_MODEL ?? 'llama-3.3-70b-versatile';
  return MODEL_CONFIGS[id] ?? MODEL_CONFIGS['llama-3.3-70b-versatile'];
}
```

### A2. Replace hardcoded values in `workout-generator.service.ts`
- `model: 'llama-3.3-70b-versatile'` → `model: config.modelId`
- `temperature: 0.73` → `temperature: config.temperature.batch`
- `temperature: 0.62` → `temperature: config.temperature.session`
- `temperature: 0.45` → `temperature: config.temperature.polish`
- `max_tokens: 4096` etc. → `max_tokens: config.batchMaxTokens.detailed` etc.
- `response_format: { type: 'json_object' }` → conditionally include only when `config.supportsJsonMode`

### A3. Add JSON fallback instruction to system prompt
In the system prompt builder, append this line **only when `!config.supportsJsonMode`**:
```
Respond with valid JSON only — no markdown, no code fences, no explanation outside the JSON object.
```
This is already implied for Groq (JSON mode enforces it), so adding it for Claude/OpenAI costs ~15 tokens but means the prompt works everywhere.

**Result:** To switch models, set `WORKOUT_MODEL=claude-sonnet-4-6` in `.env`. Zero prompt changes needed.

---

## Part B: Quality Improvements (Untapped Context)

These add or improve what gets sent to the LLM — using data that already exists in the system but isn't reaching the prompt.

### B1. Add `SLOTS_BY_FOCUS` structure to batch prompt
**File:** `workout-generator.service.ts` — batch `dayLines` assembly (~line 950)  
**Source:** `backend/src/data/program-templates.ts` — `SLOTS_BY_FOCUS`

`SLOTS_BY_FOCUS` has rich per-focus slot definitions (e.g., Push = [slot 1: horizontal press, slot 2: vertical press, slot 3: chest/shoulder isolation, slot 4: tricep isolation]) that are **already used in per-session prompts but never in the batch prompt**. This is why batch-generated push days sometimes put 2 horizontal presses in a row — the batch prompt only has the vague "compounds first" rule, not the slot map.

**Change:** In `dayLines` assembly, look up `SLOTS_BY_FOCUS[normalizeFocusToKey(focus)]` and append a compact slot line to each day entry:
```
Day 2 (Push, Tuesday, ~50 min, 5-6 ex, cap 6): [coaching rail]
  Slot order: horizontal press → vertical press → chest isolation → tricep isolation
```

**Token delta:** +30–50 tokens per day line that has a known focus  
**Quality impact:** High — this is exactly the information the model needs to balance push/pull/leg sessions correctly. Already works in per-session; bringing it to batch closes the biggest structural gap.

### B2. Include `isHardDay` intensity signal in day lines
**File:** `workout-generator.service.ts` — `dayLines` assembly (~line 950)  
**Source:** `SessionSpecDto.isHardDay` — exists in DTO, never sent to LLM

Hard/easy day designation affects what exercises should be chosen (heavy compounds with full rest on hard days; higher-rep accessories, more variety on easy days). Currently the LLM has no idea which days are hard.

**Change:** Add intensity label to the day line:
```
// hard day:
Day 1 (Upper, Monday, ~50 min, 5-6 ex, cap 6, INTENSITY: high): ...
// easy/recovery:
Day 3 (Full Body, Wednesday, ~40 min, 4-5 ex, cap 5, INTENSITY: low): ...
```

And add one line to the system prompt rules:
```
INTENSITY: high days → favor heavier compound-first selection, keep rep range at lower end of scheme. 
INTENSITY: low days → favor moderate loads, higher rep accessories, include more variety and isolation work.
```

**Token delta:** ~10 tokens per day line + ~40 tokens in system prompt (one-time)  
**Quality impact:** Medium-high — prevents the model from programming a heavy squat day immediately after another heavy leg day

### B3. Program phase → exercise selection mapping
**File:** `workout-generator.service.ts` — `progressionBlock` assembly (~line 1053)  
**Source:** `weekProgression[].phase` — already sent but only as a label; not mapped to selection rules

The phase labels ("Accumulation", "Intensification", "Deload") exist in the prompt but the LLM doesn't know what they mean for exercise selection. A deload week should use simpler, less fatiguing exercises; an intensification week should lean toward heavy barbell compounds.

**Change:** Expand `progressionBlock` to include a phase-specific selection hint:
```typescript
const PHASE_SELECTION_HINT: Record<string, string> = {
  Accumulation: 'Higher volume: favor multi-joint accessories alongside compounds. Wider exercise variety.',
  Intensification: 'Heavier emphasis: prioritize barbell compounds, reduce exercise count, increase load.',
  Deload: 'Recovery week: lighter variations, machines acceptable over barbells, higher reps, fewer sets.',
  Peak: 'Performance week: main competition or test lifts only, minimal accessories.',
};
```
Append the hint to each week's progression line.

**Token delta:** +10–20 tokens per week in the progression block  
**Quality impact:** Medium — makes week-to-week exercise selection genuinely reflect the periodization phase, not just rep/set counts

### B4. Temporal anchoring (week X of Y)
**File:** `workout-generator.service.ts` — `mesoBlock` assembly (~line 1050)

The LLM currently has no idea whether it's generating week 1 of 4 or week 6 of 8. This context matters for progression and exercise choice.

**Change:** Add to `mesoBlock` when multi-week context exists:
```
Program context: Week ${currentWeekIndex} of ${totalWeeks}${nearDeload ? ' — deload approaches next week' : ''}.
```

**Token delta:** ~15 tokens  
**Quality impact:** Low-medium — helps the model reason about where you are in the program arc

### B5. Volume landmark targets per focus
**File:** `workout-generator.service.ts` — system prompt or day lines

Currently the LLM knows "5-6 exercises" but not how many total sets should hit each muscle group. A push day should have roughly 8–12 total pushing sets (across compounds + accessories), but nothing in the prompt states this.

**Change:** Add to system prompt (one-time cost, ~60 tokens):
```
Volume targets (total working sets per session, not counting warm-up sets):
- Compound movements: 3-5 sets each; accessories: 2-3 sets each.
- Push focus: 8-12 total push sets. Pull focus: 8-12 total pull sets. 
- Lower/Legs focus: 8-12 total leg sets. Full body: 5-7 sets per pattern family.
```

**Token delta:** ~60 tokens (one-time in system prompt)  
**Quality impact:** Medium — prevents the model from under- or over-prescribing volume for the session type

---

## Part C: Prompt Rule Improvements (From Original Plan)

### C1. Rewrite batch system prompt rule (3): vague variety → concrete pattern balance
**File:** `workout-generator.service.ts` lines 1024–1037, 981–983

**Current rule (3):** "the exercise lineup must differ meaningfully between them in primary pattern, not just name" — too abstract.

**Replace rules (3)–(4) with:**
```
(3) Pattern balance per session — Push day: exactly 1 horizontal press + 1 vertical press (not 2 of the same angle). Pull day: exactly 1 vertical pull + 1 horizontal row. Lower/Legs day: 1 squat-pattern + 1 hinge-pattern. Upper day: 1 push compound + 1 pull compound in the first 2 slots.
(4) When a focus repeats across the week, the FIRST exercise must differ in movement angle (flat bench → incline or OHP on repeat push day; back squat → front squat or hack squat on repeat lower day).
(5) Follow the weekly progression targets exactly when provided.
```

Remove the `varietyInstruction` string (lines 981–983) — redundant with rule (4).

**Token delta:** ~-30 to -50 tokens  
**Quality impact:** High

### C2. Shorten `nameRules` in batch system prompt (lines 998–999)
`plainWorkoutTitle()` already strips hype words in post-processing. The word list is redundant.

**Replace with:** `'Plain short name: focus label + "A"/"B" suffix when focus repeats. No hype words.'`

**Token delta:** ~-60 to -80 tokens (appears twice in `structureBlock`)  
**Quality impact:** Neutral

---

## Part D: Token Savings (Freed Budget Goes to Quality Context)

### D1. Per-session candidate format: JSON (6 fields) → tab-separated (3 columns)
**File:** `workout-generator.service.ts` lines 1610–1624

The per-session path uses `JSON.stringify` with 6 fields per candidate. The batch path already uses lean tab-separated format. The extra 3 fields (`movementPattern`, `variationGroup`, `equipmentType`) aren't reliably used — `sessionCoachingRailLine` covers movement-pattern guidance as explicit text.

**Change:** Use existing `formatCandidatesTabularForBatch` function for per-session calls too.  
Update prompt line: `List: ${candidateJson}` → `Exercise list (id<TAB>name<TAB>muscle):\n${candidateTable}`

**Token delta:** ~-350 to -450 tokens per per-session call

### D2. Reduce per-session candidate limit: 72 → 48 (line 138)
After D1, 72 candidates is still too many for reliable attention. `buildCandidateListWithAnchorsFirst` puts anchors first, so top 48 are well-distributed.

**Token delta:** ~-200 to -300 tokens per per-session call

### D3. Eliminate polish pass; add focus-keyed warmUp/coolDown to rule-based path
**Files:** `workout-generator.service.ts → generateWorkoutByRules`, `plans.service.ts → tryHybridSimpleChunk` lines ~879–906

The polish pass fires only on `detailLevel=simple` hybrid path and costs ~900 tokens to improve copy that `plainWorkoutTitle()` partially strips anyway.

**Change:** Add a focus-keyed lookup table to `generateWorkoutByRules`:
```typescript
const FOCUS_WARMUP: Record<string, string> = {
  push:        '5 min light cardio, arm circles, band pull-aparts, shoulder rotations.',
  pull:        '5 min row or bike, band face pulls, shoulder dislocates, scapular retractions.',
  legs:        '5 min bike, bodyweight squats, hip circles, leg swings.',
  lower:       '5 min bike, bodyweight squats, hip circles, leg swings.',
  upper:       '5 min light cardio, arm circles, band pull-aparts, thoracic rotations.',
  'full body': '5 min bike or row, bodyweight squats, arm circles, hip circles.',
};
const FOCUS_COOLDOWN: Record<string, string> = {
  push:        'Stretch chest, front deltoids, and triceps; 2 min slow walk.',
  pull:        'Stretch lats, biceps, and rear deltoids; 2 min slow walk.',
  legs:        'Stretch quads, hamstrings, hip flexors, and calves.',
  lower:       'Stretch quads, hamstrings, hip flexors, and calves.',
  upper:       'Stretch chest, lats, and shoulders; 2 min slow walk.',
  'full body': 'Stretch quads, hamstrings, chest, and lats; 2 min slow walk.',
};
```
Use `normalizeFocusToKey(focus)` to look up entries, return as proper `warmUp`/`coolDown` fields. Remove polish call from `tryHybridSimpleChunk`.

**Token delta:** ~-900 tokens per generation hitting the simple hybrid path

---

## Part E: Duration Display Fix

**File:** `frontend/src/lib/estimateWorkoutMinutes.ts`

**Root cause:** `MIN_PER_SET_BASE = 3` min/set × 6–8 exercises (detailed 45-min target) → formula produces ~64 min. With `PLANNED_BLEND = 0.22` the display shows ~58 min for a 45-min plan.

**Changes:**
- **E1. Lower `MIN_PER_SET_BASE` from 3.0 → 2.5** — more accurate for real sessions mixing compounds (long rest) with accessories (short rest)
- **E2. Raise `PLANNED_BLEND` from 0.22 → 0.40** — gives user's planned duration more weight while heuristic still dominates
- **E3. Reduce detailed-mode exercise count targets** (`exerciseTargetsForSession` lines 67–69):
  - ≤38 min: keep 5–6
  - ≤55 min: `6-8` → `5-7`
  - >55 min: `7-10` → `6-9`

**Recalculated (45-min detailed, 6 exercises, 3 sets):**  
0.60 × (6×3×2.5 + 7.4 warmup + 7.5 transitions) + 0.40 × 45 = 0.60×60 + 18 = **54 min** vs ~64 min before

---

## Why Temperature Should NOT Be Lowered

An early draft proposed lowering batch temperature 0.73 → 0.50. **This is backwards.**

The retry/validation system (`generated-chunk-validators.ts`) triggers `under_diversified_across_focus` failures at the *current* 0.73 — meaning the model is **already converging too easily on the same exercises**. Lower temperature makes this worse. The backfill loop fires because the model is being too conservative, not too chaotic. Keep temperatures as-is; the structural prompt improvements in Parts B and C address variety more effectively than temperature tuning.

---

## Implementation Order

| # | Change | Impact | Effort | Token Δ |
|---|--------|--------|--------|---------|
| 1 | **A1–A3** Model config registry + env var | Enables model switch | Medium | 0 |
| 2 | **C1** Pattern balance rules + remove varietyInstruction | High quality | Simple | -40 |
| 3 | **B1** SLOTS_BY_FOCUS in batch day lines | High quality | Medium | +40/day |
| 4 | **B2** isHardDay intensity signal | Med-high quality | Simple | +50 total |
| 5 | **E1–E3** Duration display fix | High UX | Simple | 0 |
| 6 | **B3** Phase → exercise selection hints | Medium quality | Simple | +15/week |
| 7 | **D1–D2** Per-session candidate format + limit | Token savings | Simple | -650 |
| 8 | **C2** nameRules shortening | Neutral | Simple | -70 |
| 9 | **B4** Temporal anchoring | Low-medium quality | Simple | +15 |
| 10 | **B5** Volume landmark targets | Medium quality | Simple | +60 |
| 11 | **D3** Polish pass elimination + warmUp lookup | Token savings | Medium | -900 |

---

## Verification

1. `cd backend && npm test`
2. `npx jest src/plans/eval/generation-eval.spec.ts`
3. Generate test plans via the app UI:
   - 4-day Upper/Lower, 45 min, detailed — push days should have 1 horizontal + 1 vertical press; display should show ~45–54 min (not 60+)
   - 5-day PPL, 60 min, simple — repeated Push days should start with a different first compound
   - Multi-week plan with deload — deload week should show lighter/simpler exercises
4. Set `WORKOUT_MODEL=` to a different model ID in `.env` and regenerate — output should be valid without any prompt changes
