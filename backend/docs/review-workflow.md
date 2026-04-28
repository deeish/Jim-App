# Human review queue (generation quality)

This project uses **frozen JSON captures** (`logs/generation-captures/` and `src/plans/eval/captures/`) plus automated scoring to keep plan generation regressions visible. Expert-level quality still needs periodic **human judgment** on the worst-scoring weeks.

## Cadence

- **Weekly (or per release):** run the review queue and skim the bottom 5–10 captures.
- **After any prompt or enrichment change:** run `npm test` and `npm run review:queue`, then spot-check at least one hybrid capture end-to-end in the app.

## How to run the queue

From `backend/`:

```bash
npm run review:queue
npm run review:queue -- 25
```

On some shells `npm run review:queue -- --limit 25` only forwards the number; the script accepts a **trailing positive integer** as the row count (default 15). From `backend/` you can also run `npx ts-node --transpile-only scripts/review-queue.ts -- --limit 25` if you need the long flag form verbatim.

The script prints the lowest total scores first (library catalog mode) and includes `randomTopSamples` from higher-scoring captures to catch rubric blind spots. Open the JSON, read `final.findings` via `npm run eval:capture:library -- path/to/file.json`, and note **what a coach would actually change**.

## Turning review into product changes

| Finding type | Typical owner |
|--------------|----------------|
| Missing library Cardio on hybrid strength days | `session-enrichment.ts`, batch prompts in `workout-generator.service.ts`, exercise pool |
| Volume over soft cap | Prompt caps, `trimStrengthExercisesToSoftCap`, eval `scoreVolumeFit` alignment |
| Order / compound-first | `idealStrengthExercisePermutation`, enrichment sort passes |
| Balance (pull / squat-hinge) | Enrichment inserts, catalog movement tags |
| Cross-week monotony or spikes | Program templates, multi-week prompts, `cross-week-eval` fixtures |

**Prefer:** small, test-backed changes (new eval fixture + spec) over one-off prompt rewrites with no regression test.

## Golden captures

- **Must pass:** `capture-synthetic-hybrid-two-day-good.json` is asserted in `golden-capture-invariants.spec.ts`.
- **Must pass:** `generation-capture-hybrid-week-sample.json` (four-day hybrid week) includes a distinct library **Cardio** finisher on each strength day so the same golden invariant checks pass against the real catalog.

## Cross-week checks

Two-week fixtures under `src/plans/eval/captures/cross-week-*.json` are parsed by `cross-week-eval.ts` (`evaluateCrossWeekProgression`): large working-set jumps without the word “deload” in the later week summary, and heavy reuse of the same exercise ids in aligned session slots. Covered by `cross-week-eval.spec.ts`. Extend fixtures as you add real multi-week captures.

## Cross-session checks (within one week)

Same-week diversity is enforced by `cross-session-diversity.ts` and the `under_diversified_across_focus` validator issue. Two Upper days that both lead with a flat bench, or two Lower days that both lead with a back squat, are flagged so the retry tail demotes the second session's slot-1 id and the next batch attempt picks a contrasting opener (incline / overhead on Upper, hinge-led on Lower). Covered by `cross-session-diversity.spec.ts` + the `under_diversified_across_focus` describe block in `generated-chunk-validators.spec.ts`. Extend the classifier regexes when you add new exercise families.

## Capture-diff workflow (Phase 8)

When you change anything in candidate balancing (`session-enrichment.ts`, the chunk validators, or the per-session pattern / sub-muscle / cross-session caps), re-run every saved capture under `backend/logs/generation-captures/` and `backend/src/plans/eval/captures/` against the validator and diff the per-session pattern + sub-muscle distribution. Keeps regressions visible.

Quick local recipe (PowerShell or bash):

```bash
# Re-score every committed capture against the current validator + scoring code.
npm run review:queue -- 50
# Or: target a single file end-to-end (prints final.findings + breakdown).
npm run eval:capture:library -- logs/generation-captures/<file>.json
```

A capture that previously scored 130 and now scores 70 with a new `under_diversified_across_focus` / `over_concentrated_pattern` finding is the signal: either the new constraint is correct (re-record the capture) or the constraint is too tight (loosen the cap and add a fixture proving the loosened case).

## Wellness scope

Training generation is **not** medical advice. Product copy lives in `frontend/src/constants/wellnessCopy.ts` and on Generate / Plan preview screens. Keep marketing and in-app language aligned with that scope.
