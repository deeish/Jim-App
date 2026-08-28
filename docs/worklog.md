# Work log

Running record of what Claude Code worked on, per session. **Newest session at the top.**

Purpose: so Dylan can see what happened without reading a transcript, and so a later
session can summarise the work without re-deriving it.

**Status tokens** — `DONE` shipped and verified · `OPEN` real work not started ·
`NEEDS-DYLAN` blocked on a product call or a device check · `WONTFIX` decided against.

**Rules for whoever appends here**
- One row per task. Name the commit so the diff is one command away.
- Record what was **deliberately not done**, and why. That is the half that gets lost.
- Never mark `DONE` without saying how it was verified.

---

## 2026-08-27 → 08-28 — post-ship hardening

**Started from:** build 27 shipped to internal testers; repo cleaned 30 branches → 1.
**Ended:** 18 commits on `main`, all pushed, all three CI workflows green on `a33bfd0`.
**Suites:** backend 856 tests, frontend 631, both typechecks clean.

### Security

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 1 | Preview IDOR | `DONE` | `d52bea3` | `POST /workouts/preview` took `@Body()` and **no caller identity**, and `GenerateWorkoutDto.userId` carried validators, so `whitelist: true` KEPT a caller-supplied id. The generator read that user's recent workouts + last logged weights and fed them to the LLM, which returns them as `weight`/`notes`. Crew summaries publish every crewmate's `userId`, so targets were not secret. `POST /workouts/generate` never had it. Two defences: DTO field left bare so the pipe strips it, and the service overwrites from `@UserId()`. **⚠ The bare field is load-bearing — adding validators reopens the hole.** Verified: 3 new tests in `preview-scoping.spec.ts`. |
| 2 | Unbounded LLM fan-out on plan routes | `DONE` | `3d876d7` | `POST /plans` + `PATCH /plans/:id` call `createWorkoutsForPlan` with `fillAllEmptySlots: true`, which **skips the date gate**, so every slot without exercises = one sequential Groq call. `slots` had no size cap; neither route had `AiThrottlerGuard`. Now bounded three ways (`@ArrayMaxSize(120)` slots, `@ArrayMaxSize(60)` exercises, a per-request generation cap that degrades gracefully) plus the guard. Checked first that nothing legit depends on it: every client path sends slots that already carry exercises, and `PATCH /plans/:id` has **no frontend caller at all**. |
| 3 | Six lenient ownership checks | `DONE` | `3d876d7` | `plan.userId && plan.userId !== userId` made an **owner-less plan readable and writable by any authenticated user**. Tightened to a plain `!==`. **Probed production read-only first: 0 orphan plans of 27**, so no real access lost. (6 orphan `workouts` of 162 exist but `WorkoutsService.findOne` was already strict.) |

### Accessibility

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 4 | Sheets were unusable with VoiceOver | `DONE` | `540db79` | RN defaults `accessible` to **true** on `Pressable`/`TouchableOpacity` (`accessible: accessible !== false`, verified in `node_modules` at 0.81.5). On iOS that sets `isAccessibilityElement`, which VoiceOver will not traverse into. `SheetModal` tells every consumer to make the card a tap-guard `Pressable` — so the thing stopping a tap from dismissing was **swallowing every control inside**. 20 containers now set `accessible={false}`; each wrapping backdrop was checked to have its own Cancel first. |
| 5 | Controls that announced nothing | `DONE` | `540db79` | Reps + weight in a live workout (**the most-used inputs in the app**, both announced as a bare number); 3 stateless custom toggles; equipment rows that swallowed their own `<Switch>` so on and off sounded identical; month cells reading raw ISO (`2026-08-27` spoken as digits) while dropping the workout entirely; date-picker cells; icon-only buttons (month nav, close-day, back). |

### Cleanup

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 6 | ~1,260 lines of dead code | `DONE` | `a33bfd0` | 6 orphaned components (836 lines) + the uncollected half of the `WorkoutSession.tsx` deletion (`848d7f0`). **⚠ `saveWorkoutLog` was a complete SECOND implementation of workout logging** and the only `/workout-logs` POST in the service layer — exactly what someone finds by grep and "fixes". Live path is an inline `api.post` in `planCalendarPrototypeStore.ts`. Also removed `supertest` + a `test:e2e` script pointing at a `backend/test/` that does not exist; **lockfile resynced** because both CI workflows run `npm ci`. |

### Earlier the same session (already pushed before the hardening pass)

| Commit | What |
|--------|------|
| `320e377` | 401 sign-out race — Supabase rotates the refresh token, so two concurrent 401s signed users out despite a successful refresh. `lib/singleFlight`. |
| `38c857d` | Session clock in the header + an e1RM chart that can actually show progress. |
| `a8aa0b0` | e1RM personal bests — full-stack and additive; a PR won on a lighter bar now counts. |
| `e0a2efc` | A loaded carry booked 3,150 lb — timed rows log seconds in the reps field, corrupting persisted `totalVolume`. |
| `ef143cc` | Silent LLM degradation now reported — the Groq outage ran 11 days because the generator catches the failure and returns a rule-based plan. |
| `b70e645` | `GET /workout-logs` with no params returned every log with every set inline. Now defaults to a year, caps at 750. |
| `8a89790` | A failed exercise load no longer claims the exercise does not exist. |
| `491c2f7` | Preview: moving a workout onto an occupied day doubled it and silently dropped a session. |
| `5175aa3` | What's New — show that the release list scrolls. |
| `2270714` | Corrected six stale items in the July action checklist. |

### Verification performed

- Backend 856 / frontend 631 tests, both typechecks clean.
- **CI green on `a33bfd0`** — Backend CI, Frontend CI, Gitleaks. This is what proves the
  lockfile resync was right; local `node_modules` would have hidden a mismatch.
- **Rig boot after the deletions**: app bundles all 2,923 modules, all four tabs render,
  **zero page errors**.
- **Sheet behaviour after the a11y change**: sheet opens, a tap inside the card does *not*
  dismiss, the button still closes it. This was the actual risk of `accessible={false}`.
- Production probed read-only for orphan-plan counts before tightening ownership.

### Deliberately NOT done

| Thing | Why |
|-------|-----|
| Preview "Swap Workout" (audit 4.5) | **Confirmed real**: `handleReplaceWithType` writes the card to `planData` but nulls the session in `planDraft`, so Apply emits an exercise-less slot — invisible to the calendar *and* the crew streak. Every fix changes product behaviour. `NEEDS-DYLAN`. |
| Plan management IA | `getPlanById`/`updatePlan` had zero callers (now deleted); there is still no list endpoint. Needs an IA decision + the 5.13 delete-semantics call. `NEEDS-DYLAN`. |
| `planDisplayName.ts` | Only its own test calls it, but it plausibly belongs to the rename flow. Deleting it means deleting the test too — a different decision. |
| `MAX_CHANGELOG_ENTRIES` | No code reads it, but it is what the pruning-rule comment points at. |
| `runPipeline` | Test scaffolding (runs the pipeline with mock stages 5–6), not dead product code. |
| `TouchableWithoutFeedback` in `AuthScreenLayout` | Keyboard-dismiss wrapper; RNW stubs `KeyboardAvoidingView`, so the risk is unverifiable from the rig. |
| Groq model swap | Dylan is picking the replacement himself. |

### Traps worth not re-learning

- **`frontend/dist/` is a gitignored 85 MB stale web build.** Its minified names produce
  false grep hits and it predates several deletions. Exclude it; a repo-root `grep -r`
  times out on it.
- **Skia `PictureRecorder` page errors in the web rig are pre-existing noise.** They appear
  non-deterministically (0 on one run, 105 on the next, *identical code*). `JGlyph.tsx` has
  a try/catch **and** a `GlyphBoundary` that degrades to a text "J". Filter them, don't chase.
- **The What's New sheet only auto-opens for a RETURNING user** (`seen !== null`). To make
  it open in the rig, set `jim_whatsnew_seen_v1` to an *old* id — removing the key does the
  opposite of what you want.
- **Count in-file references before calling an export dead.** `VALID_EQUIPMENT` and
  `SLOTS_BY_FOCUS` look unused from outside and are not.
- **"Dead" and "test-only" are different categories.** Deleting a test-only export means
  deleting its test, which is a separate decision.

### Still open

| # | Task | Status | Notes |
|---|------|--------|-------|
| A | What's New scroll on device | `NEEDS-DYLAN` | Affordance fixed (`5175aa3`) but web cannot exercise the native touch responder. One observation needed: is the fade visible, does it scroll? |
| B | VoiceOver pass on any bottom sheet | `NEEDS-DYLAN` | The fix is iOS-only and structurally invisible on web + jest. |
| C | Render deploy confirmation | `OPEN` | No Render→GitHub reporting on this repo, no version marker on `/api/health`, and 22/22 polls returned 200 with no restart blip — so no crash-loop, but the swap was never observed. Dashboard deploy log is the authority. |
| D | 24 colour-only selection controls in `GeneratePlanScreen` | `OPEN` | Need `accessibilityState={{ selected }}`; the boolean is already computed on every one of those lines. |
| E | ~10 touch targets under 44pt | `OPEN` | Includes the live workout's 40pt check button — the most-tapped control in the app. `hitSlop` is the fix and is already used well in 49 places. |
| F | Remaining unlabelled controls | `OPEN` | 2 per-day time-cap steppers, 7 numeric fields with neither label nor placeholder, the split-tile info button (unreachable — nested inside an `accessible` tile), 2 full-screen unlabelled dismiss overlays. |
| G | Fixed-height containers vs Dynamic Type | `OPEN` | 4 containers hold scalable text at a fixed height; `minHeight` is the pattern already used correctly elsewhere. |
