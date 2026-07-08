# Plan Generation — Issues, Flaws & Edge Cases

> Compiled 2026-07-06 from a live bug diagnosis (beta users reporting "my plan
> disappears"), a code audit of the plan/calendar pipeline, and the still-open
> items from the 2026-06 workout-quality audit. Each issue lists symptom, root
> cause with file references, proposed fix, and edge cases. Priorities:
> **P0** = users are hitting it now, **P1** = fix before public launch,
> **P2** = fast-follow.

Companion docs: `backend/docs/PLAN_GENERATION_FLOW_AND_ISSUES.md` (pipeline
mechanics) and `backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md` (coaching /
prompt quality). This doc is the actionable defect list.

## How it works today (orientation)

- Generation: `POST /api/plans/generate-sessions` → `PlansService.generateSessions`
  → Groq LLM (week 1 only; later weeks are cloned + progressed with **no LLM
  call** — a 3-week plan costs ~2 Groq calls; keep it that way, we are on the
  free tier).
- The preview the user sees after generating lives **only in memory** (route
  params + React state; `draftId` is `draft-${Date.now()}`, nothing persisted).
- Applying the preview calls `POST /plans` (`PlanPreviewScreen.tsx:1007`),
  which stores the plan in Postgres with `userId` + `isActive: true` and
  deactivates prior plans (`plans.service.ts:171`). **Plans are never deleted
  or expired server-side.**
- Every screen resolves "what applies today" through
  `programWeekForCalendarOffset(offset, weekAnchorMonday, maxProgramWeek)`
  (`planCalendar.ts:196`): program week 1 is anchored to the Monday of the
  plan's start week, and the function returns `null` when the current calendar
  week falls **before the anchor or after the last program week**.

---

## P0 — "My plan disappeared" (program-window cliff)

**Report:** generate an AI plan, close the app, come back later — the plan is
gone. Multiple beta users.

**The data is fine.** Nothing deletes plan rows. What actually happens:

1. The generate form defaults to a **1-week program** (`GeneratePlanScreen.tsx:477`,
   `weeks: 1`). Onboarding "Get my plan" and the normal flow both go through
   this default.
2. Applying anchors week 1 to the Monday of the start week
   (`PlanPreviewScreen.tsx:1009`); start date defaults to today.
3. The moment the next calendar week starts, `programWeekForCalendarOffset`
   returns `null` (`planCalendar.ts:217`, `planWeek > maxProgramWeek`), and
   every surface empties at once:
   - Home: grey "Outside your program" card (`HomeScreen.tsx:623`).
   - Plan tab: all seven days render empty (`PlanScreen.tsx:329` →
     `EMPTY_PLAN`) plus an out-of-range banner (`PlanScreen.tsx:1264`).
   - Workout tab: "Outside your program week" (`WorkoutScreen.tsx:76`).

**Timeline of the cliff** (1-week plan): generate Monday → blank in 7 days;
generate Wednesday → blank in 5; generate Saturday → blank in 2; **generate
Sunday → blank the next morning** (`getWeekStartMonday` anchors Sunday to the
Monday six days earlier, `planCalendar.ts:100`).

The plan is still reachable via the Plan week strip's back arrow (12-week
lookback), but nothing tells the user that.

**Proposed fix — roll the schedule forward when the program ends:**
when the current week maps past `maxProgramWeek`, resolve to the **last
program week's schedule** instead of `null`, on Home, Plan, and Workout, with
a banner: "Repeating week N — generate a fresh block to keep progressing."
A 1-week plan then behaves as the recurring weekly routine users expect.
Optionally also raise the default `weeks`, but that only delays the cliff.

**Edge cases the fix must handle** (audited 2026-07-06 against the schema —
`Workout` rows carry **no calendar date**, only a weekday string, and are
unique per slot via `@@unique([planWorkoutId, userId])`; they are reusable
templates, with all history in date-stamped `WorkoutLog` rows):

- **Workout reuse is native.** Repeating a week reuses the slot's existing
  Workout row (`materializeFromPlanSlot` returns the existing one,
  `workouts.service.ts:164`), and starting it again just adds a new dated
  WorkoutLog. No re-materialization or dating work is needed — saved
  weights/notes even carry over, which is desirable.
- **Completion display is the real hazard — and it's already broken** (see
  the week-dots issue below). Any "done" indicator must come from
  date-ranged completed WorkoutLogs, never from "a workout row exists for
  this slot". Plan-tab badges already do this correctly via `weekLogs`
  (`getCalendarWeekRange`); Home's week dots do not.
- **Multi-week plans: clamp vs cycle.** Clamping repeats the last week
  forever (simple, predictable). Cycling modulo restarts week 1 after week N
  (matches "program" mental model, worse for progression math). Recommend
  clamping.
- **Anchor in the future** (user picked a start date next week): current
  behavior is also `out_of_program` (`planCalendar.ts:216`) with a "before
  your program start" banner. Keep that — do not roll *backward*.
- **Legacy plans without an anchor** never expire (offset+1 mapping,
  `planCalendar.ts:203`) — the fix must not change their behavior.
- **Bad rows:** `weekNumber < 1` normalizes to 1
  (`normalizeProgramWeekNumber`); keep the fix downstream of that.

**Alternate causes to rule out with users reporting this** (both real, both
look identical to "my plan disappeared"):

1. **Preview never applied.** The generated preview is memory-only. Generate
   → admire it → kill the app → there was never a plan. Also burns an AI
   rate-limit slot. See "Preview persistence" below.
2. **Forced sign-out.** On a 401 the client refreshes the token and retries;
   if the refresh fails it calls `supabase.auth.signOut()`
   (`api/client.ts:79`). The user lands on the login screen — reads as "the
   app lost everything."

---

## P1 — Workout-quality flaws (still open from the 2026-06 audit)

The four launch-blocking fixes shipped (volume caps, `Math.round` progression,
bidirectional split purity, cardio-row normalization — all in the tree:
`clampSessionWorkingSets`, `runFocusPurityPass`). Still open, in priority
order:

1. **Per-session movement-pattern cap (deferred "Issue 4").** Dedup only
   catches identical exercise ids, so a session can carry 3–4 hinge variants.
   Fix: cap ≤2 exercises per movement pattern per session, deterministic
   post-pass (no Groq). The replace-exercise endpoint already does
   pattern-aware dedup — reuse its logic.
2. **Intra-session push/pull balance.** Only "≥1 pull" is guaranteed; upper
   days can come out 5-press : 1-row. Fix: pull-ratio pass alongside the
   purity pass (`generation-chunk-repair.ts`).
3. **Intra-plan volume undulation.** Sessions sharing a duration all get the
   same working-set cap, so there is no heavy/light day variation across a
   week. Fix: vary `workingSetCap` by `isHardDay`.
4. **Ordering without a tier-0 anchor.** Days with no true Squat/Hinge/Push
   anchor sort accessories first. Fix: fall back to the highest-tier available
   movement as the anchor.

Constraints for all of these: deterministic server-side passes only (zero new
Groq calls), keep `backend npm test` + `plans/eval/` green, add invariants for
each new rule.

---

## P1 — Home week dots show days as "completed" that were never done

Found during the 2026-07-06 audit. `HomeScreen.tsx:326` marks a day's dot
"completed" when *any materialized workout exists* for one of its slots:

```ts
const completed = nonRest.some((s) =>
  weeklyWorkouts.some((w) => planSlotLinksWeeklyWorkout(s.id, w.planWorkoutId)));
```

That proxy ("workout row exists ≈ user started it") broke when applying an AI
preview began materializing workouts for **every slot with exercises, all
weeks, upfront** (`plans.service.ts:424`, `ensureWorkoutFromPlanSlotExercises`
has no week gate). Net effect: the moment a generated plan is applied, every
training day's dot can render solid ("completed") for the whole week.

**Fix:** derive dot completion from completed WorkoutLogs in the current
calendar week — the exact pattern Plan-tab badges already use (`weekLogs`,
date-ranged, `completedAt != null`). Must land with (or before) the P0
roll-forward fix, since repeated weeks make an existence-based proxy
permanently wrong.

---

## P1 — Reliability / UX

- **Preview persistence.** The generated sessions exist only in navigation
  state. App killed or crashed during preview = generation lost + rate-limit
  slot burned. Fix: persist the last preview draft to AsyncStorage keyed by
  `draftId` and offer "Resume your generated plan?" on next open; clear on
  apply. (This also directly reduces "plan disappeared" reports.)
- **401 refresh race → sign-out.** Home and Plan fire concurrent requests on
  app open; if both 401 and refresh coordination fails, the client signs the
  user out (`api/client.ts:64-81`). Verify supabase-js dedupes concurrent
  `refreshSession()` calls; consider only signing out on a *definitive*
  invalid-refresh-token error rather than any refresh failure.
- **Rate-limit UX (confirmed bad).** `AiThrottlerGuard` throws the default
  `ThrottlerException`, and the preview's error path surfaces raw
  `error.message` (`planPipeline.ts:720`, `pipelineStage5CatchMessage`), so a
  throttled user sees **"Request failed with status code 429"**. Fix: map 429
  to friendly copy ("You've hit today's generation limit — try again
  tomorrow") in `pipelineStage5CatchMessage`.
- **Apply atomicity (confirmed, mild).** `create()` commits the plan row,
  then materializes workouts outside any transaction
  (`plans.service.ts:226`). If materialization throws, the client gets a 500
  *after* the plan exists; the natural retry (apply again) creates a second
  plan (the first is auto-deactivated, so no user-visible dupe — just orphan
  rows). Acceptable short-term; wrap in a transaction or make `create`
  idempotent when convenient.
- **Timeout copy.** Client waits 150s in prod (`planService.ts:219`); the
  timeout message suggests a one-week preview. Multi-week is now ~2 Groq calls
  so timeouts should be rare — confirm with capture logs before spending here.

---

## P2 — Catalog data

- **Deadlift muscle-group inconsistency.** Conventional Deadlift is filed
  under **Legs**, Sumo Deadlift under **Back** (visible on the Exercises tab).
  The split-purity pass already special-cases hinge movements so generation
  survives, but labels, colors, body-map tiles, and muscle filtering all
  surface the inconsistency. Decide one home for deadlifts (recommend Legs)
  and re-tag.
- **`subMuscles` coverage gaps.** Exercises without sub-muscle data fall back
  to whole-group body-map highlights (rows + detail hero) and are invisible to
  sub-muscle filter chips. Audit the catalog for empty `subMuscles` on popular
  exercises and backfill.

---

## Operational constraints (do not lose)

- **Backend deploys before frontend builds/OTA.** The frontend sends `limit`
  on exercise search; an older deployed backend rejects unknown properties
  with 400 (`forbidNonWhitelisted`). Always deploy the backend first.
- **Keep generation at ~2 Groq calls per plan** (week 1 generated, rest cloned
  + progressed). Any fix that adds LLM calls needs explicit sign-off.
- **Eval harness is the gate**: `backend/src/plans/eval/` (golden fixtures,
  invariants, scoring) must stay green; new rules get new invariants.

---

## Cross-cutting edge cases

- **Sunday generation** → 1-week plan is out-of-program the next morning
  (worst case of the P0 cliff).
- **DST week boundary.** `programWeekForCalendarOffset` computes
  `Math.floor(diffMs / 7 days)` between local midnights
  (`planCalendar.ts:214`). Across a spring-forward, Monday→Monday is
  7d − 1h → `floor` yields the *previous* week for that whole week. Use
  `Math.round`, or compare calendar dates instead of ms.
- **Timezone travel.** The anchor is stored as a date (noon-UTC,
  `plans.service.ts:167`) but compared against the device-local Monday —
  users crossing many timezones near a week boundary can see the week flip a
  day early/late. Acceptable for now; document, don't chase.
- **Server materializes by UTC week, client maps by local week.** Auto-
  materialization at apply time only covers today-or-future slots of the
  current **UTC** week (`utcWeekRangeContaining`, `plans.service.ts:298`),
  while every screen maps weeks in device-local time. A user west of UTC
  applying on Sunday evening can straddle the boundary; harmless today (the
  Start button materializes on demand), but keep in mind for the roll-forward
  work.
- **Inconsistent "current plan" resolution.** `findWeekly` picks the plan by
  `updatedAt` only (`workouts.service.ts:218`), while plans endpoints prefer
  `isActive` (`plans.service.ts:93`). They agree today because creating a plan
  both deactivates and out-dates the old one — but any future feature that
  touches an inactive plan's `updatedAt` desyncs the Workout tab. Align
  `findWeekly` on the `isActive`-first query.
- **Mid-week start.** Week 1 is anchored to Monday even when the user starts
  Wednesday, so Mon/Tue of week 1 are already in the past at creation. Slots
  placed there look "missed" on day one. Consider auto-scheduling week-1 slots
  onto remaining days only.
- **Two devices.** Plan changes on device A appear on device B only after a
  refetch; `useFocusEffect` reloads on focus, so this is mostly fine — but a
  workout started on A and resumed on B is untested territory.
- **Legacy rows.** Plans with `userId: null` (pre-auth era) are invisible to
  `GET /plans/me` (userId-scoped) — fine; `getById` guards cross-user access
  (`plans.service.ts:161`).

---

## Recommended order

1. **Week-dots completion fix** (small, self-contained, and a prerequisite:
   roll-forward makes the existence-based proxy permanently wrong).
2. **P0 roll-forward fix** (with the reuse/completion edge cases above) —
   the active user-facing bug.
3. **Preview persistence** (cheap, kills the second "disappeared" cause).
4. **DST `floor` → `round`** (one line, do it while in `planCalendar.ts`).
5. **429 friendly copy** in `pipelineStage5CatchMessage` (one function).
6. Quality items 1–2 (pattern cap, pull ratio) as one backend PR with
   invariants.
7. Catalog re-tagging (deadlifts, subMuscles backfill) + `findWeekly`
   `isActive` alignment.
