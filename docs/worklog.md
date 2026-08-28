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

## 2026-08-28 — Crew feature review (code, not concept)

Dylan asked how to improve the Crew page. **The evidence sweep in memory
(`reference_crew_social_mechanics_evidence`) is unambiguous: Crew's ceiling is
DELIVERY (push), not design — ship, don't add.** So this was a correctness review
of the crew code rather than a feature hunt. Four real defects found and fixed.

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 16 | Crew made in the evening lost its first streak day | `DONE` | `4a0bbd6` | `crewCreatedIso` is the **floor the crew streak counts back to**, built with `crew.createdAt.toISOString().slice(0,10)` — the UTC date. `createdAt` is a real timestamp, so a crew started 9pm on the 27th in US Eastern reads as created on the **28th**, and the streak loop breaks on `d < floor` before counting that afternoon's session. Every other timestamp in `getSummary` already used `localDateIso`. ⚠ The `weekAnchorMonday` slice two lines above looks identical but is **correct** — that column is `@db.Date`. Difference is the column type, not the style. |
| 17 | Pound count could tick up then snap back | `DONE` | `59f12a5` | `toggleKudos` returned `count({ toUserId, eventRef })` while the summary that repaints the chip queries `crewId: crew.id`. They diverge once a recipient has been in another crew that still exists. Same failure shape as the old `kudosWeek`/`kudosLatest` bug: not a wrong write, two different questions rendered as one number. |
| 18 | Badge only noticed activity on a **cold start** | `DONE` | `7654417` | `refreshCrewBadge` ran once on mount, and the tab navigator mounts once per launch. Background the app overnight, come back, and the dot still showed yesterday until a force-quit. With no push, a foreground is the *only* moment the app can notice a crewmate trained — so this was most of the mechanic missing. |
| 19 | Crew screen showed yesterday's week after a foreground | `DONE` | `93237e9` | `useFocusEffect` covers arriving at the tab, not returning to the app while already on it. ⚠ Gated on `useIsFocused`, and **that gate is load-bearing**: bottom tabs keep the screen mounted, and `load` ends in `markCrewSeen`, so an ungated listener would clear the Crew dot on every foreground while the user sat on Home — marking activity seen that was never shown. |

### Verification

- Backend 858 tests, frontend 631, both typechecks clean.
- The streak fix is pinned by **two new tests on `crewStreakDaysOf`** that assert the
  consequence, not the spelling: a crew created the same day counts that day, and a floor
  one day late returns **0**. The existing specs passed `crewCreatedIso` in as a literal,
  which is exactly why the service's own conversion was never covered.
- ⭐ **The foreground work was verified behaviourally in the rig**, not just compiled.
  RN-web maps `AppState` to `visibilitychange`, so faking hidden→visible is possible:
  on Crew a foreground fired **+2** summary calls (badge + screen), on Home **+1**
  (badge only, screen correctly stayed out), and **0** while hidden. That second number
  is the proof the focus gate holds and the badge cannot be cleared unseen.

### Deliberately NOT done

| Thing | Why |
|-------|-----|
| **Any new crew mechanic** | The evidence sweep lists the replicated nulls: assigned accountability buddies (PNAS, N≈250k, n.s.), all-or-nothing crew goals (Patel, p=.96), ordinal ranks in small groups (lowers the most active), naming who owes. The buildable versions are the ones that tested null. |
| `@@unique([fromUserId, toUserId, eventRef])` missing `crewId` | The toggle's `deleteMany` can still reach a row in a crew the user has left, and scoping the delete without widening the constraint would make a re-pound hit P2002 and report `pounded` with no row to show. Needs a **migration + backend-first deploy**, so it wants a session that can coordinate that. |

---

## 2026-08-28 — accessibility round 2 (the rest of the audit)

Worked the open a11y items from the previous block (D–G). Frontend 631 tests,
typecheck clean, all four commits pushed.

| # | Task | Status | Commit | What and why |
|---|------|--------|--------|--------------|
| 8 | 24 colour-only selection controls | `DONE` | `6da0060` | `theme/colors.ts` states the rule outright — colour only *reinforces* identity, it never carries it — and the newer screens honour it. `GeneratePlanScreen` did not: goal, secondary goal, training days, location, experience, equipment, duration, the custom-split builder, hybrid ratio, detail level, progression, avoid chips, cardio modality, focus priority all changed **only colour**, so a VoiceOver user heard four options with no way to tell which was active. The boolean was already computed on each line to pick the "selected" style. |
| 9 | Remaining unlabelled controls | `DONE` | `6da0060` | 2 per-day time-cap steppers (the only unlabelled ones of the ten — an oversight, not a convention), 7 numeric fields announcing a bare "45", 2 full-screen dismiss overlays that put a large unlabelled button in front of the sheet. |
| 10 | Split-tile info button was unreachable | `DONE` | `6da0060` | Nested inside a tile that is itself an accessibility element, so with VoiceOver on its Alert could never be opened. The text is now one constant used twice: the Alert for sighted users, an `accessibilityHint` on the tile for everyone else. |
| 11 | Four tap targets under 44pt | `DONE` | `a692fd2` | The live workout's set-complete button (40×40, **most-tapped control in the app**), Home's What's New (32×32) and profile (42×42) buttons, and `WorkoutLikeButton` (42×42, whose sibling already had `hitSlop: 10`). Each checked for neighbours first — slop that overlaps trades a missed tap for a **wrong** one. |
| 13 | Three status dots that were colour-only | `DONE` | `6de2d8a` | Each was the **only** signal that something happened, with no spoken equivalent: the Crew tab's unseen dot (the tab said "Crew" either way — `crewBadgeHasUnseen` lived inside the icon, so the subscription became a small `useCrewUnseen` hook the navigator holds), Home's What's New badge (constant label), and the crew avatar's story ring (gold = trained today, blue = training today; the row label never mentioned today). **Verified in the rig**: labels actually exposed as `"What's new, unread"` and `"Crew"`, all four tabs still render after the hook move, zero page errors. These map to `aria-label` on web, so unlike `accessibilityState` they *can* be checked here. |
| 12 | Three fixed-height boxes vs Dynamic Type | `DONE` | `6e1897a` | Home's week tile (56pt box, two 11pt rows, no `numberOfLines`), the day-cap input, the picker's month-nav button. All → `minHeight`, the pattern used elsewhere. `navBtn` checked for the circle trap first: its radius is a fixed token, so it is a rounded square. |

| 14 | Three labels describing something other than the screen | `DONE` | `40ff83f` | Home's week tile draws the muted dash for rest, skipped **and** no-muscle days but only said "rest day" for the first — a skipped day announced its workout title as if still scheduled. A crew member's row is two sibling touchables opening the same sheet, both with the identical label, so every member was announced twice; the second is the week strip and now names that. The pound chip's explicit label was **replacing** the synthesized one and silencing the count beside it. |
| 15 | Goal / experience pickers showed no current selection | `DONE` (half) | `e33216f` | The list rendered every option identically, so VoiceOver read four goals as if none were active. Added `accessibilityState`; the values were already in scope. ⚠ **Half a fix on purpose** — a sighted user cannot see the current choice either. See NEEDS-DYLAN below. |

### Verification, and its limits

- Ran the codemod as a **dry run first**, printing all 24 extracted conditions before
  applying; 22 matched the multi-line shape, 2 inline ones were done by hand. Output read
  back site by site afterwards.
- Booted the rig, navigated Calendar → Month → **Generate a Plan**: the screen renders,
  **zero page errors**. That is the check that matters for a codemod in a 3,900-line TSX
  file, since `tsc` alone would not catch a mangled JSX tree.
- ⚠ **`accessibilityState` cannot be verified on web.** react-native-web derives
  `aria-selected` from `accessibilitySelected` alone, never from `accessibilityState`, so
  the rig reports 0 `aria-selected` elements even though the props are correct.
  `accessibilityState` **is** the right API on iOS/Android, where every tester is —
  **do not "fix" this by switching to the RNW-only prop.**
- ⚠ `minHeight` ≥ `height`, so those three render **identically** at the default text size.
  That is what makes the change safe and also why nothing visible changed. Needs a device
  with a larger text size to actually exercise.

### Deliberately NOT done (with reasons)

| Thing | Why |
|-------|-----|
| Crew pound chips (`pump`, `dayPound`) | Real measurements (~26pt and 18pt), but the day tile above already extends `hitSlop` `bottom: 4` into the 4pt gap, and on a member row the chip sits between the row itself (opens a sheet) and `personBottom`. Slop there turns a near-miss into a **wrong action**. Needs a device, not a measurement. |
| Picker **visual** selected state | The Profile goal/experience list has no checkmark, no tint, no trailing tick — confirmed on screen: with goal = Strength, the row above reads "Goal — Strength" while "Strength" in the list looks identical to the other five. Choosing how that should look is a design call. `NEEDS-DYLAN`. |
| `dayPound` height → `minHeight` | Coupled to `dayPoundSpacer`, which exists to hold untrained columns to the same height so tiles stay on one baseline. The spacer has no content, so it cannot grow with it — converting one without the other breaks the alignment it was written to protect. Needs a shared measurement. |

### Rig facts worth keeping

- **Metro under `CI=1` does not watch files.** The server was serving a stale bundle after
  edits; restart with `--clear`. (Already in memory; it bit again here.)
- The Calendar tab can restore to **Week**, not Month. The planning rows ("Generate a
  Plan", "Quick Workout") live on Month — click back at `(26, 32)` to get up the stack.
- Home shows "Plan data unavailable" with no backend, so the **week tiles do not render** —
  frontend-only boot cannot verify anything that needs plan data.

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
