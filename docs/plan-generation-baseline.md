# Plan generation baseline (2026-09-17, Tier 1 of the generation plan)

The measurement that Tier 2 (the prescription layer) is built against. See
`docs/audits/2026-09-16-plan-generation-deep-dive.md` for the plan and
`backend/src/plans/coach-check.ts` for what the new dimensions count.

## What changed in the eval

The scorer's ceiling moved from 140 to 168. Six coach-check dimensions were
added, computed per week and averaged across a chunk:

| Dimension | Max | What it measures |
|---|---|---|
| weeklyVolume | 8 | Share of expected muscle groups whose weighted weekly sets (direct + 0.5 × secondary) fall inside the goal-and-level band (`weeklyVolumeBand`). |
| muscleExposure | 4 | With three or more lifting days, each big group trained on two or more of them. |
| patternStacking | 4 | Minus 2 per session with three or more hinges, or three or more pressing compounds. |
| restByRole | 4 | Minus 1 per row whose rest does not fit its role (main lift under 120 s; isolation, core or hold over 90 s). |
| skillGate | 4 | Zero if a beginner's week contains a technical lift (cleans, snatches, jerks, pistols, push press, muscle-ups, handstands, Turkish get-ups). |
| effortTarget | 4 | Share of strength rows carrying a load or a reps-in-reserve target (holds count). A rep range alone does not count, because every row has one. |

Old dimensions are unchanged. The coach check is skipped (full marks) for
fixtures whose catalog carries no muscle metadata, the same rule the balance
dimension uses. The same report is returned by `POST /plans/generate-sessions`
as `coachCheck[]` and logged as `coach_check`, so the number the eval optimises
is the number the app can show.

## Fixture suite (`npm test`, `generation-eval.scoring.spec.ts`)

Gates: every scenario ≥ 152, average ≥ 156 (before: ≥ 134 and ≥ 136 of 140).

| Scenario | Total | volume | exposure | stacking | rest | skill | effort |
|---|---|---|---|---|---|---|---|
| chunk_duplicate_across_four_strength_days | 159 | 5 | 2 | 4 | 4 | 4 | 0 |
| chunk_upper_focus_hinge_clash | 154 | 0 | 4 | 2 | 4 | 4 | 0 |
| chunk_hybrid_goal_appends_cardio_finisher | 158 | 2 | 4 | 4 | 4 | 4 | 0 |
| chunk_below_min_exercises_fixed_by_repair | 156 | 0 | 4 | 4 | 4 | 4 | 0 |
| chunk_cardio_two_day_clean | 168 | 8 | 4 | 4 | 4 | 4 | 4 |
| chunk_clean_stays_ok | 155 | 3 | 2 | 2 | 4 | 4 | 0 |
| chunk_dup_across_program_weeks | 156 | 0 | 4 | 4 | 4 | 4 | 0 |
| chunk_in_session_dup_repaired | 158 | 2 | 4 | 4 | 4 | 4 | 0 |
| chunk_lower_two_day_clean | 158 | 2 | 4 | 4 | 4 | 4 | 0 |
| chunk_recovery_session_clean | 168 | 8 | 4 | 4 | 4 | 4 | 4 |
| chunk_three_day_strength_cardio_clean | 158 | 2 | 4 | 4 | 4 | 4 | 0 |
| chunk_two_day_upper_bench_dup | 158 | 2 | 4 | 4 | 4 | 4 | 0 |

Average 158.8, minimum 154. The fixtures are two- to four-day slices, so
weekly volume reads low by construction; they guard structure, not volume.

## Real captures (`npm run eval:captures:report`, 77 captures, 2026-07-10 to 2026-09-17)

These are plans the OLD pipeline produced (before Tier 0), scored with the new
scorer. This is the "before" picture.

| | Value |
|---|---|
| Mean total | 146.7 / 168 |
| Median | 150 |
| Minimum | 76 (four validator-capped captures) |
| Validator ok | 94.8% |
| Batch to per-session fallback | 5.2% |

Dimensions furthest from their ceiling:

| Dimension | Average | Share |
|---|---|---|
| effortTarget | 0.1 / 4 | 2% |
| patternStacking | 1.8 / 4 | 45% |
| weeklyVolume | 5.3 / 8 | 67% |
| volumeFit | 8.1 / 12 | 68% |
| muscleExposure | 2.9 / 4 | 73% |
| restByRole | 3.0 / 4 | 76% |
| fatigueStacking | 4.6 / 6 | 77% |

Most frequent coach findings across the 77 captures: shoulders under the
weekly band (43 captures), pressing compounds stacked three or more deep on
an upper or push day (30, 18 and 19 captures for three different day
titles), legs over the band (30), chest under the band (22).

## What Tier 2 has to move

- effortTarget from 2% to close to 100%: every strength row gets a load where
  history exists, and an RIR target everywhere.
- patternStacking from 45%: at most two pressing compounds per session, at
  most two hinges.
- weeklyVolume from 67% and muscleExposure from 73%: sets allocated from a
  weekly per-muscle tally, not a per-exercise band and a time cap.
- restByRole from 76%: already improved by Tier 0 (rest by role shipped
  2026-09-16); the captures predate it.
- Mean total on a fresh replay of the 2026-09-14 captures (`npm run
  eval:drive`) from about 147 to 160 or better, with no old dimension losing
  ground.

## Re-drive after Tier 2 (2026-09-17)

The three 2026-09-14 `generate_sessions` captures (a 5-day advanced hybrid, a
3+1-day beginner strength, a 4-day advanced hybrid over 4 weeks) were replayed
through the current pipeline (`npm run eval:drive`, Gemini 3.5 Flash-Lite, no
user history) and scored with the same scorer as the originals.

| | Before (same 3 inputs, old pipeline) | After (Tier 0-2e) |
|---|---|---|
| Mean total | 155.0 / 168 | 161.3 / 168 |
| Median | 155 | 162 |
| Min / max | 154 / 156 | 156 / 166 |
| effortTarget | 0 / 4 | 4 / 4 |
| restByRole | 4 / 4 | 3.7 / 4 |
| fatigueStacking | 4.3 / 6 | 5.7 / 6 |
| workoutOrder | 6.7 / 8 | 7.7 / 8 |
| patternStacking | 1.3 / 4 | 2.7 / 4 |
| muscleExposure | 2.7 / 4 | 2.3 / 4 |
| weeklyVolume | 6.7 / 8 | 6.7 / 8 |
| coachingProDepth | 7.3 / 8 | 6.7 / 8 |

The target ("160 or better, no old dimension losing ground") is met on the
total; muscleExposure and coachingProDepth each gave back a little on one
capture. What the re-driven plans still get wrong, read as a coach would:

1. **Push days still stack three presses.** The prompt rule is not enough:
   one Push day is push-up, overhead press, dip. Needs a deterministic
   repair (third press becomes an isolation for the same muscle).
2. **Hybrid days are light.** A 30-60 min advanced hybrid day carries three
   lifts and a 10-minute jog (12-13 sets). The exercise count is planned
   from the 45-minute midpoint and the cardio tail takes one of the four
   slots.
3. **A bodyweight main lift on a gym day.** Push-up leads an advanced Push
   day; the loaded press should.
4. **Three lifting days as Push/Pull/Legs.** Each muscle is trained once a
   week; with three days a full-body or upper/lower/full week is what a coach
   would write, and the exposure score says so.
5. A pattern-floor insert carries no effort target (band lat pulldown, RIR
   missing).

These are Tier 2f, below.

### After Tier 2f (same three inputs)

| | After 2e | After 2f |
|---|---|---|
| Mean total | 161.3 | 161.7 |
| patternStacking | 2.7 / 4 | 4 / 4 |
| muscleExposure | 2.3 / 4 | 2 / 4 |
| weeklyVolume | 6.7 / 8 | 6 / 8 |

Stacking is solved. Exposure and weekly volume move with the LLM's picks
between runs (the same three inputs, a different draw), which is why the
fixture gates, not the re-drive, are the regression guard.

