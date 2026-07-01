# Documentation index

Use this page to find the right doc and keep **last reviewed** dates honest. When you change behavior described in a doc, update that file and bump **Last reviewed**.

| Document | Purpose | When to update |
|----------|---------|----------------|
| [PLAN_REVIEW.md](./PLAN_REVIEW.md) | Pre-execution plan, review gate, verification | Every initiative; archive copies under `docs/plans/` for large work |
| [PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md](./PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md) | Long-term Plan Preview navigation (stack screen vs Modal, ExerciseDetail stack) | When refactoring Plan Preview, ExerciseDetail back, or Plan stack routes |
| [PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md](./PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md) | Short-term modal/focus mitigations and investigation notes | When changing Plan Preview modal behavior; superseded over time by long-term doc |
| [../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md](../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md) | End-to-end plan generation, pipeline stages, known system issues | After changes to `generate-sessions`, pipeline, or preview/regenerate flows |
| [GENERATE_PLAN_UI_TO_AI_COVERAGE.md](./GENERATE_PLAN_UI_TO_AI_COVERAGE.md) | Which Generate Plan fields reach `PlanInputs` / Groq vs UI-only; quality gaps; phased plan | When changing `buildPlanInputs`, `GenerateSessionsDto`, or pipeline stages 1–4 |
| [ONBOARDING_WELCOME_REVIEW.md](./ONBOARDING_WELCOME_REVIEW.md) | First-run / welcome review: flow gaps, best fix, and impact per idea (auth → onboarding → auto-generate) | When changing auth screens, onboarding, the auto-generate hand-off, or `GenerateSessionsDto` bounds |
| [../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md](../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md) | Product/UX gaps in LLM workouts (rest, slots, copy) | After prompt or generator behavior changes that affect coaching quality |
| [exercises-page-ux-round2.md](./exercises-page-ux-round2.md) | Exercises page round-2 follow-ups: stale-backend 400 + deploy order, search race guard, equipment summary chip, filter-furniture slimming, acceptance walkthrough | When working the round-2 items or changing SearchScreen filters/search behavior |
| [exercise-visuals-plan.md](./exercise-visuals-plan.md) | Exercise imagery without licensed assets: muscle-group color/icon discs, owned body-highlight diagram (Skia), optional YT-thumb/AI line-art garnish | When adding exercise imagery or changing muscle-group metadata |

## `docs/plans/`

Per-initiative plans copied from `PLAN_REVIEW.md` (e.g. `2026-03-24-feature-name.md`). Keeps the root template clean while preserving history.

- [2026-06-17-navigation-performance.md](./plans/2026-06-17-navigation-performance.md) — ~2s tab-switch delay: investigation, ruled-out causes, measure-first plan (Sentry tracing), safe wins, and a gated cache plan.
- [2026-06-19-liquid-glass-icon.md](./plans/2026-06-19-liquid-glass-icon.md) — Deferred: iOS 26 Liquid Glass app icon (Icon Composer layers + EAS), why it's not a Swift rewrite, and the flat-PNG fallback.
- [2026-06-19-replace-exercise-quality.md](./plans/2026-06-19-replace-exercise-quality.md) — Not started: per-exercise "replace" picks near-duplicates / wrong muscle; fix = backend catalog-based replacement keyed on the target's muscle + movement-pattern dedup.

## Maintenance

- **Stale docs** hurt more than missing docs: if code and docs disagree, fix the doc in the same PR as the code when possible.
- **Single source of truth:** System behavior → `backend/docs/PLAN_GENERATION…`; coaching/prompt quality priorities → `LLM_GENERATION_HONEST_ASSESSMENT.md`; process → `PLAN_REVIEW.md`.

**Last reviewed (this index):** 2026-06-17
