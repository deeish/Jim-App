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

## Wellness scope

Training generation is **not** medical advice. Product copy lives in `frontend/src/constants/wellnessCopy.ts` and on Generate / Plan preview screens. Keep marketing and in-app language aligned with that scope.
