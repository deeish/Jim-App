# Documentation index

Use this page to find the right doc and keep **last reviewed** dates honest. When you change behavior described in a doc, update that file and bump **Last reviewed**.

| Document | Purpose | When to update |
|----------|---------|----------------|
| [PLAN_REVIEW.md](./PLAN_REVIEW.md) | Pre-execution plan, review gate, verification | Every initiative; archive copies under `docs/plans/` for large work |
| [PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md](./PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md) | Long-term Plan Preview navigation (stack screen vs Modal, ExerciseDetail stack) | When refactoring Plan Preview, ExerciseDetail back, or Plan stack routes |
| [PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md](./PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md) | Short-term modal/focus mitigations and investigation notes | When changing Plan Preview modal behavior; superseded over time by long-term doc |
| [../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md](../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md) | End-to-end plan generation, pipeline stages, known system issues | After changes to `generate-sessions`, pipeline, or preview/regenerate flows |
| [GENERATE_PLAN_UI_TO_AI_COVERAGE.md](./GENERATE_PLAN_UI_TO_AI_COVERAGE.md) | Which Generate Plan fields reach `PlanInputs` / Groq vs UI-only; quality gaps; phased plan | When changing `buildPlanInputs`, `GenerateSessionsDto`, or pipeline stages 1–4 |
| [../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md](../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md) | Product/UX gaps in LLM workouts (rest, slots, copy) | After prompt or generator behavior changes that affect coaching quality |

## `docs/plans/`

Per-initiative plans copied from `PLAN_REVIEW.md` (e.g. `2026-03-24-feature-name.md`). Keeps the root template clean while preserving history.

## Maintenance

- **Stale docs** hurt more than missing docs: if code and docs disagree, fix the doc in the same PR as the code when possible.
- **Single source of truth:** System behavior → `backend/docs/PLAN_GENERATION…`; coaching/prompt quality priorities → `LLM_GENERATION_HONEST_ASSESSMENT.md`; process → `PLAN_REVIEW.md`.

**Last reviewed (this index):** 2026-04-17
