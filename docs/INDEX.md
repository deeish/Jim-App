# Documentation index

Use this page to find the right doc and keep **last reviewed** dates honest. When you change behavior described in a doc, update that file and bump **Last reviewed**.

| Document | Purpose | When to update |
|----------|---------|----------------|
| [PLAN_REVIEW.md](./PLAN_REVIEW.md) | Pre-execution plan, review gate, verification | Every initiative; archive copies under `docs/plans/` for large work |
| [PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md](./PLAN_PREVIEW_LONG_TERM_ARCHITECTURE.md) | Long-term Plan Preview navigation (stack screen vs Modal, ExerciseDetail stack) | When refactoring Plan Preview, ExerciseDetail back, or Plan stack routes |
| [PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md](./PLAN_PREVIEW_MODAL_OVERLAY_INVESTIGATION.md) | Short-term modal/focus mitigations and investigation notes | When changing Plan Preview modal behavior; superseded over time by long-term doc |
| [../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md](../backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md) | End-to-end plan generation, pipeline stages, known system issues | After changes to `generate-sessions`, pipeline, or preview/regenerate flows |
| [GENERATE_PLAN_UI_TO_AI_COVERAGE.md](./GENERATE_PLAN_UI_TO_AI_COVERAGE.md) | Which Generate Plan fields reach `PlanInputs` / Groq vs UI-only; quality gaps; phased plan | When changing `buildPlanInputs`, `GenerateSessionsDto`, or pipeline stages 1–4 |
| [auth-sign-in-setup.md](./auth-sign-in-setup.md) | Sign-in providers (Apple, Google, emailed codes): Supabase + console setup, what needs a new binary, Hide My Email behaviour, where the code lives | Before shipping the identifier-first sign-in, or when a provider button is missing |
| [ONBOARDING_WELCOME_REVIEW.md](./ONBOARDING_WELCOME_REVIEW.md) | First-run / welcome review (June 2026): flow gaps, best fix, and impact per idea (auth → onboarding → auto-generate) | When changing auth screens, onboarding, the auto-generate hand-off, or `GenerateSessionsDto` bounds |
| [onboarding-review-2026-09.md](./onboarding-review-2026-09.md) | Onboarding questions and ending (Sept 2026): what other gym apps add and why, generate-vs-explore evidence, where Skip belongs, the `emilkowalski/skills` repo, ordered recommendations | Before changing the onboarding steps, the payoff screen, or the template/AI exits |
| [../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md](../backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md) | Product/UX gaps in LLM workouts (rest, slots, copy) | After prompt or generator behavior changes that affect coaching quality |
| [plan-generation-issues.md](./plan-generation-issues.md) | Actionable defect list for plan generation: the P0 program-window cliff ("my plan disappeared"), open quality flaws, reliability/UX gaps, catalog data issues, edge cases, fix order | When fixing any plan-generation issue or changing planCalendar/homeToday week mapping |
| [worklog.md](./worklog.md) | Running record of what each Claude Code session worked on: tasks done (with commits), what was deliberately skipped and why, traps not worth re-learning, and what is still open | Append a session block at the TOP whenever work is done; never mark DONE without saying how it was verified |
| [../brand/README.md](../brand/README.md) | Brand assets + spec (Sept 2026): the segmented-J mark, app icon variants (light/dark/mono), geometry, colours, dash patterns for the in-app progress element, usage rules | When touching the app icon, splash, `JimLogo`, or any progress ring that reuses the mark |
| [exercise-visuals-plan.md](./exercise-visuals-plan.md) | Exercise imagery without licensed assets: muscle-group color/icon discs, owned body-highlight diagram (Skia), optional YT-thumb/AI line-art garnish | When adding exercise imagery or changing muscle-group metadata |

## `docs/plans/`

Per-initiative plans copied from `PLAN_REVIEW.md` (e.g. `2026-03-24-feature-name.md`). Keeps the root template clean while preserving history.

- [2026-06-17-navigation-performance.md](./plans/2026-06-17-navigation-performance.md) — ~2s tab-switch delay: investigation, ruled-out causes, measure-first plan (Sentry tracing), safe wins, and a gated cache plan.
- [2026-06-19-liquid-glass-icon.md](./plans/2026-06-19-liquid-glass-icon.md) — Deferred: iOS 26 Liquid Glass app icon (Icon Composer layers + EAS), why it's not a Swift rewrite, and the flat-PNG fallback.
- [2026-06-19-replace-exercise-quality.md](./plans/2026-06-19-replace-exercise-quality.md) — Not started: per-exercise "replace" picks near-duplicates / wrong muscle; fix = backend catalog-based replacement keyed on the target's muscle + movement-pattern dedup.
- [2026-07-29-session-handoff.md](./plans/2026-07-29-session-handoff.md) — Record of the 2026-07-29 review-fix pass on `feat/progress-finish-screen`: four parallel fix lanes (~755 lines, 15 files), committed 2026-07-31 as five themed commits. Lists every fix, the verification state (both full suites green), and the two decisions still open (UTC month windows in History, workout-deletion semantics).
- [2026-07-27-progress-and-history.md](./plans/2026-07-27-progress-and-history.md) — **All four phases implemented 2026-07-28** (finish screen, Progress screen, per-exercise history, three read endpoints); see §0 for what shipped and the one decision still open (workout-deletion semantics). Phased plan + seven correctness traps — read §3.3 and §3.7 first (a `dayKey` migration shipped in the wrong order 400s every workout save under `forbidNonWhitelisted`; and "personal best" computed from the existing 30-log window ships false PRs).

## Maintenance

- **Stale docs** hurt more than missing docs: if code and docs disagree, fix the doc in the same PR as the code when possible.
- **Single source of truth:** System behavior → `backend/docs/PLAN_GENERATION…`; coaching/prompt quality priorities → `LLM_GENERATION_HONEST_ASSESSMENT.md`; process → `PLAN_REVIEW.md`.

**Last reviewed (this index):** 2026-06-17
