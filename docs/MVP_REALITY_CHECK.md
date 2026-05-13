# Jim App — MVP Reality Check

> **Verdict (one line):** **Not MVP-ready.** You can hand a TestFlight build to friends and family today; you cannot submit this to the App Store or Play Store as it stands, and you cannot operate it safely once strangers are on it. Realistic ETA to public beta: **4–6 focused weeks**.

This document is intentionally blunt. You asked for a brutal reality check, not a pat on the back. The good news is at the bottom — read the bad news first.

---

## TL;DR

| Area | Status | Risk |
| --- | --- | --- |
| Backend code structure | Solid | Low |
| Auth (Supabase JWT) | Works | Medium (no revocation, one IDOR) |
| Plan generation pipeline | Runs end-to-end | High — silent failures, no retry/timeout |
| Workout logging | Records sets | Medium — no aggregation, no PRs |
| Live workout UX | Functional skeleton | **High — no rest timer, no pause/resume** |
| Calendar / progress | View-only | **High — no PRs, volume, streaks** |
| Exercise library | Loads | Medium — no videos, no pagination |
| Onboarding | 3 steps | High — too shallow for a good AI plan |
| Profile / settings | Partial | Medium — no password change; in-app **export + delete** wired (see §7 Week 2 status) |
| Tests (backend) | Good | Low — but eval not gated in CI |
| Tests (frontend) | Minimal | High — 9 lib tests, zero UI tests |
| Observability | Logs only | **High — no APM, no request IDs, no uptime monitor** |
| Security | Hardened surface | **High — IDOR, no token revocation;** gitleaks scans repo on CI |
| Compliance | Partial | **High —** no **hosted** privacy/ToS URLs for stores yet; **GDPR-style export + delete APIs + UI** in progress (see `docs/compliance-week2.md`, §7 Week 2 status) |
| Monetization | None | **Blocker — no paywall, Groq costs unbounded** |
| Backups / DR | Runbook only; **not executed** | High — see §7 Week 2 + `docs/backup-restore-drill.md` |
| Mobile build | EAS configured | Low |
| CI | Lint/test/build on PR | Medium — E2E manual only |

---

## 1. What Actually Works

So you know what *not* to throw away:

- The plan/workout generation pipeline runs end-to-end. A user can onboard → generate a plan → preview → save → see it in Calendar.
- Auth flow is wired (Supabase JWT, both HS256 legacy and RS256/ES256 JWKS in `backend/src/auth/auth.service.ts`).
- Plan CRUD + slot add/move/remove works (`backend/src/plans/plans.controller.ts`).
- Static exercise catalog (5000+ entries) loads and is searchable.
- Calendar UI renders logged workout days correctly (timezone bug already fixed).
- CI runs lint + tests + build on every PR (`.github/workflows/`).
- Backend hardening is real — Helmet, CORS, ValidationPipe, ThrottlerModule, the custom `AiThrottlerGuard`.
- Backend eval harness for plan generation exists and is non-trivial (`backend/src/plans/eval/*`).
- Recent code audit cleaned up `console.*` calls in favour of NestJS `Logger` across the major services.
- Frontend uses sensible state management (Context API, AsyncStorage persistence).

Everything below is what's broken, missing, or insufficient.

---

## 2. Severity A — Blockers (cannot launch publicly)

These will get you rejected from the stores, sued, or DDoS'd by your own Groq bill. Fix before any public listing.

### A1. IDOR on `POST /api/plans/generate-sessions`
**Where:** `backend/src/plans/plans.controller.ts:70-75`
```ts
@Post('generate-sessions')
@UseGuards(AiThrottlerGuard)
generateSessions(@Body() dto: GenerateSessionsDto) {
  return this.plansService.generateSessions(dto);
}
```
No `@UserId()` parameter, no ownership check on the plan referenced by the DTO. An authenticated user can spam generation against another user's plan ID and burn their throttle budget (and your Groq spend). Every endpoint that touches a user-owned resource must check `userId === plan.userId`. Audit every method — this is unlikely to be the only one.

### A2. No privacy policy / Terms of Service
Apple and Google both require a **hosted** privacy policy URL for accounts and AI features. The repo has placeholder text in `docs/legal/` and frontend env keys (`EXPO_PUBLIC_*` in `frontend/.env.example`), but there is no production hosting plan or store-ready URL yet. **Store submission will be rejected until URLs are live.**

### A3. GDPR/CCPA delete / export (partially addressed)
- **Done (app data):** `GET /api/users/me/export` and `DELETE /api/users/me` plus Profile flows; complete Auth removal needs `SUPABASE_SERVICE_ROLE_KEY` on the backend (`backend/.env.example`). See `docs/compliance-week2.md`.
- **Still required for compliance posture:** **hosted** legal pages, counsel-reviewed copy, executed backup/restore drill, and (if you promise it) soft-delete / audit strategy for destructive mistakes (see B9).

### A4. Push notifications are stubbed
**Where:** `frontend/src/screens/ProfileScreen.tsx:658` (`value="Coming soon"`). No permissions, no scheduler, no token registration. Fitness apps live or die on workout reminders + streak alerts; shipping without this means churn at week two.

### A5. Silent Groq failures with no resilience
**Where:** `backend/src/workouts/workout-generator.service.ts:1103, 1473, 1752` (three separate `new Groq({ apiKey })` call sites!).
- No timeout on the SDK client.
- No retry policy.
- No circuit breaker.
- Failure path falls back to a rule-based generator with no log of *why* Groq failed — you cannot tell if it was rate-limited, timed out, returned malformed JSON, or hit `finish_reason: 'length'`.
- Per-request client instantiation is also wasteful — should be a single injected client.

### A6. No request-ID correlation
**Where:** `backend/src/common/sanitized-exception.filter.ts` logs `kind/status/method/path/ts` but no request ID. When a user reports "my plan generation failed at 3pm," you have **no way to find their request in the logs** under concurrent traffic. Add a middleware that assigns `crypto.randomUUID()` to every request and threads it through all log lines.

### A7. No backend crash reporting
Sentry is configured for the frontend (`@sentry/react-native`) but **gated on `EXPO_PUBLIC_SENTRY_DSN`** — most builds will ship without it. The backend has **zero crash reporting**; errors disappear into stdout. Add `@sentry/node` (or BetterStack/Datadog) to `backend/src/main.ts` and ship Sentry on by default in frontend production builds.

### A8. Backup-restore drill not executed
Repo runbook: `docs/backup-restore-drill.md`. `docs/database-production.md` still does not replace an **executed** restore into staging (PITR or backup). A fitness app's workout history is irreplaceable — rehearse restores and record who/when/results.

### A9. Zero monetization
No Stripe, no RevenueCat, no IAP, no paywall, no quota beyond the AI throttler. Every Groq call costs real money; every user costs real money; there is currently no revenue path. Either choose a model (subscription? credit pack? free + premium tier?) and wire it up, or accept that runway is finite and tracked manually.

---

## 3. Severity B — Significant gaps (users will notice within a week)

### B1. Live workout session is a skeleton
**Where:** `frontend/src/components/WorkoutSession.tsx` (**3082 lines in one file**).
Tracks sets/reps/weight/RPE. Missing:
- **Rest timer** with countdown, vibration, sound.
- **Pause/resume** with persisted session state — close the app mid-workout and you lose context.
- **Auto-fill from last session** — forces manual entry every time.
- **Form/cues video or GIF inline** during a set.

Compare with Hevy / Strong — they all have rest timer + autofill. Without these, users will install once, do one workout, uninstall.

### B2. Calendar is view-only
**Where:** `frontend/src/screens/CalendarScreen.tsx`. Shows which days were logged. No:
- Personal records per exercise.
- Weekly volume / tonnage chart.
- Streak counter.
- Adherence % (scheduled vs. completed).
- Body weight or measurement trends.

Users come back to a fitness app to see *progress*. There is currently nothing to see.

### B3. Search loads all exercises into nested ScrollViews
**Where:** `frontend/src/screens/SearchScreen.tsx` (**1357 lines**). Multiple nested ScrollViews with accordion panels; no `FlatList`, no windowing, no pagination. Pulls the full catalog into memory. Will stutter badly on low-RAM Android devices.

### B4. GeneratePlan is a 3617-line mega-form
**Where:** `frontend/src/screens/GeneratePlanScreen.tsx`. Single screen, single component, 150+ fields, no multi-step. No graceful recovery if the backend times out; the user has filled a multi-minute form and gets nothing on failure. Refactor into a wizard.

### B5. Onboarding is too shallow
**Where:** `frontend/src/screens/OnboardingScreen.tsx` (3 steps: goal, experience, equipment). Missing fields the AI plan generator needs to produce a real prescription:
- Age, sex, height, weight (current + target).
- Injuries / movement restrictions.
- Available weekly schedule (days + time per session).
- Specific goal nuance (lean bulk vs. cut, marathon vs. 5k, etc.).

GeneratePlanScreen asks some of these later, which duplicates work and contradicts the onboarding promise.

### B6. No deep links, share, or social
`authDeepLink.ts` handles password reset only. No "share this workout" / "copy plan" / "follow a friend." No viral surface, no acquisition loop beyond paid install.

### B7. No analytics
No PostHog, Amplitude, Mixpanel, Segment, or even a homebrew event log. You cannot measure funnel drop-off, feature usage, or retention. You are flying blind.

### B8. DB schema missing hot-path indexes
**Where:** `backend/prisma/schema.prisma`.
- `WorkoutLog` has indexes on `userId` and `startedAt` separately but no composite `(userId, startedAt DESC)` for the most common query.
- `WorkoutExercise` has no index on `exerciseId` — "which workouts contain pull-ups?" is a full scan.
- `PlanWorkout` indexed on `(workoutPlanId, weekNumber, dayOfWeek)` but not on `dayOfWeek` alone.

### B9. All foreign keys are `onDelete: Cascade`
**Where:** `backend/prisma/schema.prisma:72, 97, 144, 145, 162, 186, 208, 209, 231, 253` (at least ten relations).
Deleting a `User` cascades through 9+ tables silently. No soft-delete column, no audit log, no protection. If your GDPR-deletion endpoint has a bug, you can nuke other people's data. Switch to soft-delete (`deletedAt` column) where the data is recoverable.

### B10. Timezone handling is fragile
**Where:** `backend/src/plans/plans.service.ts:135` (`dateOnlyFromYmd`). Parses `"YYYY-MM-DD"` as UTC noon. Week anchors stored as `@db.Date` (no TZ). DST transitions and user travel will break week boundaries. Move to TZ-aware date logic, or store ISO strings + user TZ.

### B11. Rate limiter is count-based, not cost-based
The `AiThrottlerGuard` counts requests; a 4000-token batch counts the same as a 100-token request. Groq cost scales with tokens, not call count. A heavy user with a permissive plan can blow your budget while staying under quota. Track tokens consumed per user per window.

### B12. JWT has no revocation or session invalidation
**Where:** `backend/src/auth/auth.service.ts`. Tokens are verified by signature alone — there is no blacklist, no `tokenVersion` on the User row, no logout-everywhere capability. If a token is stolen, it is valid until natural expiry. Add a session-version column or a revoked-token table.

### B13. Eval suite is not gated in CI
**Where:** `.github/workflows/backend-ci.yml` runs `npm test` but not the full plan-generation eval. The eval is real, but you can ship a prompt change that regresses generation quality and CI will not catch it. Add the eval as a required job (with a snapshot tolerance) or split it into a nightly that pages on regression.

### B14. No aggregation endpoints
**Where:** `backend/src/workout-logs/workout-logs.service.ts` has `create`, `findAll`, `findOne` — that's it. No endpoints for:
- Weekly/monthly volume per user.
- Personal records per exercise.
- Adherence ratio (scheduled vs. completed).
- 1RM estimates / strength trends.

Frontend cannot show progress because backend cannot compute it.

### B15. No pagination
- `backend/src/workout-logs/workout-logs.controller.ts` `findAll()` returns every log in the date range.
- `backend/src/exercises/exercises.controller.ts` search caps at ~220 with no offset/cursor.

Add cursor pagination before someone has 500 logged workouts.

### B16. Profile is missing core account flows
**Where:** `frontend/src/screens/ProfileScreen.tsx`.
- No in-app password change.
- **Export + automated account deletion:** implemented (`docs/compliance-week2.md`).
- Notifications row is dead.

### B17. Plan editing has no undo
Delete a session or regenerate a week and it's gone immediately. No "Undo" snackbar, no soft-delete, no version history. Users *will* destroy work by accident.

### B18. No uptime monitoring or APM
`docs/backend-operations.md` says "alert on `level:error`" but no vendor is configured. No Pingdom, BetterUptime, Healthchecks.io. If the API goes down at 2am, you will learn from the App Store review.

---

## 4. Severity C — Polish & tech debt

### C1. Component bloat
- `frontend/src/components/WorkoutSession.tsx` — 3082 lines.
- `frontend/src/screens/GeneratePlanScreen.tsx` — 3617 lines.
- `frontend/src/screens/SearchScreen.tsx` — 1357 lines.
- `backend/src/plans/plans.service.ts` — 2269 lines.
- `backend/src/workouts/workout-generator.service.ts` — 2574 lines.

Files this large are write-only — nobody else will be able to safely modify them, and future-you will hate present-you.

### C2. Inconsistent error UX across screens
`Alert.alert` here, inline error text there, silent toast elsewhere, completely silent in one place. Pick one pattern (toast + retry button) and apply it everywhere.

### C3. Weak network resilience
- No exponential backoff on retries.
- Token refresh uses fixed 80ms sleeps, not exponential.
- No offline mode — close the app on the subway, see a spinner forever.
- No request timeout on Groq paths — can hang indefinitely.

### C4. Accessibility patchy
Some screens have `accessibilityLabel` / `accessibilityRole`, most do not. Fixed font sizes everywhere; no `allowFontScaling`. Won't pass an Apple a11y review and will exclude visually-impaired users.

### C5. Frontend test coverage minimal
9 tests, all in `src/lib/*`. Zero component tests, zero screen tests, no integration tests. `jest.config.js` collects coverage from `src/lib/**` only. Refactoring screens is a tightrope walk with no net.

### C6. E2E exists but isn't on PR
`.github/workflows/e2e-staging.yml` is `workflow_dispatch` only. Playwright is set up but only runs when someone clicks the button. Move to PR-triggered (or at minimum nightly) once you have a stable staging environment.

### C7. Pre-commit hooks (partially addressed)
**CI:** `.github/workflows/gitleaks.yml` scans on PR/push. **Local:** root `package.json` + Husky + `lint-staged` run backend/frontend `npm run lint` when matching files are staged (run `npm install` once at repo root). Hooks are opt-in via that install — CI remains the safety net.

### C8. Missing repo hygiene
No `CODEOWNERS`, no PR template, no `docs/incident-response.md`, no architecture overview doc for non-Claude contributors.

### C9. No global error boundary on the frontend
A screen crash will blank the app in production. Wrap the root navigator in an `ErrorBoundary` that logs to Sentry and shows a "Something went wrong — restart" screen.

### C10. Pervasive `any` casts
`catch (err: any)`, `as any`, `React.ComponentType<any>` show up across 15+ files. Tighten the catch blocks to `unknown` + narrow, and properly type the third-party shims.

### C11. Mobile store metadata not versioned
Screenshots, support URL, content rating, store descriptions are not in the repo. In 6 months you'll be scrambling to rebuild the store listing.

### C12. Frontend Sentry not on by default
DSN is gated on env var. Most builds won't ship with crash reporting. Make it default-on for production channels in `eas.json`.

---

## 5. Code that should be looked at deeper

You asked specifically which pages need a second pass. In priority order:

| File | Why | Priority |
| --- | --- | --- |
| `backend/src/plans/plans.controller.ts` | IDOR audit — every endpoint must check ownership | **P0** |
| `backend/src/workouts/workout-generator.service.ts` | Add timeout/retry/circuit, dedupe `new Groq()` calls, surface real errors | **P0** |
| `backend/src/auth/auth.service.ts` | Add revocation; verify clock skew and audience claims | **P0** |
| `backend/prisma/schema.prisma` | Add composite indexes; switch from CASCADE to soft-delete on user data | **P1** |
| `frontend/src/components/WorkoutSession.tsx` | Split into smaller components; add rest timer + pause/resume | **P1** |
| `frontend/src/screens/GeneratePlanScreen.tsx` | Refactor mega-form into multi-step wizard with retry | **P1** |
| `frontend/src/screens/SearchScreen.tsx` | Move to `FlatList` + windowing; paginate API | **P1** |
| `frontend/src/screens/CalendarScreen.tsx` | Add PR/volume/streak widgets | **P2** |
| `frontend/src/screens/ProfileScreen.tsx` | Implement password change, data export, automated delete | **P2** |
| `backend/src/plans/generation-chunk-repair.ts` | Handle pool-exhaustion case; add tests for malformed Groq output | **P2** |
| `backend/src/plans/plans.service.ts` | Split file; add ownership checks; fix timezone parsing | **P2** |
| `backend/src/common/sanitized-exception.filter.ts` | Add request-ID correlation | **P0** |

---

## 6. Features to add before public launch

### User-facing (Frontend)
- [ ] Rest timer with vibration/sound (configurable per exercise type)
- [ ] Pause/resume with persisted session state
- [ ] Personal-records detection + strength progression chart
- [ ] Weekly volume / tonnage chart
- [ ] Streak counter + adherence ratio
- [ ] 1RM calculator
- [ ] Exercise videos or GIFs (linked from catalog)
- [ ] Body measurements log (weight + body parts over time)
- [ ] Push notifications: workout reminders, streak saves, rest-day prompts
- [ ] Deep-link / share for workouts
- [ ] In-app password change
- [ ] Global error boundary with "report this" CTA
- [ ] Onboarding fields: age, sex, height, weight, injuries, weekly schedule
- [ ] Pull-to-refresh + offline draft mode for live sessions

### Backend
- [x] Account-deletion endpoint (`DELETE /api/users/me`)
- [x] Data-export endpoint (`GET /api/users/me/export`)
- [ ] Request-ID middleware + correlation logging
- [ ] Sentry (or equivalent) wired into `main.ts`
- [ ] Groq client: single injected instance, timeout, retry, circuit breaker
- [ ] Token revocation / session versioning
- [ ] Aggregation endpoints: PRs, volume, adherence
- [ ] Cursor pagination on workout logs and exercise search
- [ ] User-ownership audit on every controller
- [ ] Soft-delete for User and Plan rows
- [ ] LLM cost/token tracking per user per window — structured `groq_completion` logs exist; persist or dashboard remains

### Compliance & business
- [ ] Privacy policy + Terms of Service (hosted, linked in app + store listings)
- [x] GDPR-style delete + export flows (API + Profile; hosted legal pages + drills still outstanding — see §7 Week 2)
- [ ] Paywall / subscription (RevenueCat or Stripe)
- [ ] Backup-restore drill (**runbook** in `docs/backup-restore-drill.md`; **execution** still required)
- [ ] App store metadata (screenshots, support URL, content rating) versioned in repo

### Ops / observability
- [ ] Uptime monitoring (BetterUptime / Pingdom / Healthchecks.io) hitting `/api/health/ready`
- [ ] LLM cost dashboard
- [ ] Log aggregation vendor (Logtail / Better Stack / Datadog) wired to backend stdout
- [ ] Alert routing (PagerDuty / email / Slack) on error spikes

### Developer ergonomics
- [x] Pre-commit hooks (husky + lint-staged) — repo root; optional local install
- [x] Secret scanning (gitleaks job in CI)
- [ ] `CODEOWNERS`, `.github/pull_request_template.md`
- [ ] `docs/incident-response.md` runbook
- [ ] E2E in CI on PR (not just `workflow_dispatch`)
- [ ] Eval suite gated as required CI check
- [ ] Component / screen tests for the top 10 critical screens

---

## 7. Recommended pre-launch sprints

> Adjust based on team size — this assumes one full-time dev.

**Week 1 — Security & resilience (the "can't launch without")**
- Plug IDOR on `generate-sessions` and audit every controller for ownership checks.
- Add Groq timeout / retry / circuit breaker; dedupe to one injected client.
- Request-ID middleware + correlation log line on every error.
- Backend Sentry + uptime monitor.
- Schema: composite indexes on hot paths.

**Week 2 — Compliance & ops**
- Privacy policy + ToS (write or buy a template, host it, link it).
- Account-deletion endpoint + automated frontend flow.
- Data-export endpoint.
- Pre-commit hooks + secret scanning in CI.
- Backup-restore drill (execute, document).
- LLM cost tracking + dashboard.

**Week 2 — status (in-repo)**  
See `docs/compliance-week2.md` for env vars and filenames. Summary:

| Item | Done | Still to do |
|------|------|-------------|
| Privacy + ToS | Placeholder Markdown in `docs/legal/`; app reads `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` (see `frontend/.env.example`). | Host real HTTPS pages; replace copy with counsel-reviewed text; point env + store listings at those URLs. |
| Account deletion | `DELETE /api/users/me` + Profile “Delete account”; DB cleared in one transaction; optional Supabase Auth removal when `SUPABASE_SERVICE_ROLE_KEY` is set server-side. | Set service role secret in prod; optionally confirm Auth deletion in dashboards. |
| Data export | `GET /api/users/me/export` + Profile “Export my data” (share sheet / fallback). | None for MVP beyond size/UX tweaks if exports grow huge. |
| Pre-commit + secret scan | Husky + lint-staged at repo root (`package.json`; run `npm install` at repo root once); `.github/workflows/gitleaks.yml` on PR/push to `main`. | Tune gitleaks allowlists if CI noise appears. |
| Backup–restore drill | Runbook checklist: `docs/backup-restore-drill.md`. | **Execute** a restore into staging (or disposable DB); record dates, owner, outcome in that doc or your ops wiki. |
| LLM cost + dashboard | Structured JSON logs (`event: "groq_completion"`, tokens, `finish_reason`) from `WorkoutGeneratorService`; phased plan in `docs/ops/llm-cost-tracking.md`. | Aggregation / alerting (Metabase, log vendor, DB table — “dashboard” and budgets are ops/product follow-up). |

**Week 3 — Workout-experience hardening**
- Rest timer + pause/resume.
- PR detection + weekly volume chart.
- Expand onboarding (age/sex/height/weight/injuries/schedule).
- `FlatList` + pagination in Search.

**Week 4 — Plan generation polish + retention**
- Refactor GeneratePlan into a multi-step wizard with cancel + retry.
- Push notifications (workout reminders + streak saves).
- Deep links + share for workouts.
- E2E in CI; store metadata versioned.

**Weeks 5–6 — Polish, paywall, beta**
- Paywall + subscription integration.
- Closed-beta TestFlight + Play internal testing round; iterate on feedback.
- Final accessibility pass.
- App Store + Play Store submission packets.

---

## 8. Final verdict

The bones are good. The code is clean, the audit work has paid down a lot of debt, the infrastructure thinking is mature. But "well-structured code" is not the same as "a product ready for the public," and the gap between the two is real here.

There is at least one IDOR that a 15-year-old with a Burp Suite trial would find. The plan generator silently degrades to a rule-based fallback with no telemetry. Half the Profile screen says "Coming soon." There is no **hosted** privacy policy or Terms URL suitable for stores yet (`docs/legal/` placeholders + env wiring exist). Export and in-app account deletion are implemented, but stores and GDPR expectations still require hosted legal pages and operational backup drills (`docs/compliance-week2.md`). There is no way for you to know whether the app is up. There is no way for you to make money.

**Soft launch (TestFlight + Play internal) — fine today.** Friends, family, a Discord of trusted beta testers. You will learn a lot.

**Public launch — no.** 4–6 weeks of focused work on the items above and you will be in a defensible position. Less than that and you will ship a product that gets one-star reviewed for missing rest timers, leaked through an IDOR you didn't know existed, and silently burns Groq credits you cannot account for.

You asked for brutal. That is brutal. The good news is none of this is mysterious — it is all concrete, citable, and tractable. Pick the Severity A list, work through it, and you will have a real product.
