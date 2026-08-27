# Jim — prioritized action checklist

**Source:** `2026-07-30-app-deep-dive.md` (the audit) + the 2026-07-31 two-agent review pass that verified ~28 of its claims and re-sequenced the plan.
**Sorting:** P0 → P5, most important first. Within a tier, items are also roughly ordered.
**Tags:** `[OTA]` ships over-the-air today · `[BINARY]` requires the next native TestFlight build · `[BE]` backend (auto-deploys via Render) · `[DECIDE]` a decision, not code · `[DOC]` documentation change. Effort: **S** = hours, **M** = days, **L** = week+.

Why this order: P0 items either **corrupt permanent data on every use** (cost compounds daily) or are trivial embarrassment/review risks; P1 is the single biggest daily-use gap; P2 unfreezes the product's identity; P3 gives it a voice and a face; P4 is reliability debt; P5 is the wall.

---

## Re-verification pass, 2026-08-26

Every unchecked item below was re-read against the working tree. Boxes are now ticked only where the current code was confirmed to do the thing.

**The single fact that reframes half of P0/P1/P2:** `frontend/src/components/WorkoutSession.tsx` (3,501 lines) is **orphaned** — nothing imports the component, and `frontend/src/screens/WorkoutScreen.tsx` was deleted. The live session is `PlanCalendarDayScreen` → `PlanCalendarWorkoutScreen` → `PlanCalendarWorkoutCompleteScreen`. Any item below whose evidence is a `WorkoutSession.tsx` / `WorkoutScreen.tsx` line number describes code that no longer runs; each was re-checked against the live flow instead. The dead file should be deleted or deliberately re-adopted — leaving it makes every future audit re-find these bugs.

> **DELETED 2026-08-27.** `WorkoutSession.tsx` is gone. Every line reference to it below is now historical: those bugs were closed by removal, not by a fix. The two libraries it was the second consumer of (`lastPerformanceDisplay`, `nextTargetSuggestion`) still have live callers in the calendar session flow. `types/workout.ts`'s `WorkoutSessionState` was kept at first — it was the designed-but-never-built rest-timer model **item 1.1** refers to (an earlier note here said 1.4; 1.4 is success haptics, and was already built). **It has since been deleted too**, along with `WorkoutSessionRestoredSnapshot` and `lib/workoutDraftStorage.ts`, which lost its last importer when the component went. The reason for keeping it expired the same night: 1.1 got built, and deliberately *not* on that model — `WorkoutSessionState` stores `restTimeRemaining` / `restTimerPaused`, a tick-counting design, which is precisely the bug 1.1's fix removes. Leaving it in the repo would have invited someone to rebuild it. ⚠ The AsyncStorage key `jim_workout_draft_v1` may still hold bytes on devices that ran the old session; nothing reads it now and it is harmless.

P0 boxes and item text are updated in place below. For P1–P4 the boxes are left as the July author wrote them; this table is the current verdict, and where it says BUILT the item is done regardless of the unticked box:

| item | verdict, 2026-08-26 | where |
|---|---|---|
| 1.1 rest timer | **BUILT** — but off `restHeuristic`'s `"2:30"` string, not the prescription's `restSeconds` | `PlanCalendarWorkoutScreen.tsx` |
| 1.2 keep screen awake | **STILL MISSING** — `expo-keep-awake` is not even a direct dependency | — |
| 1.3 elapsed clock in session | **STILL MISSING** — the only session clock is the finish screen's count-up | — |
| 1.4 success haptics | **BUILT** — `buzzSetComplete` / `buzzAllSetsComplete` | `planCalendarPrototype.ts` |
| 1.5 streak + flame on Home | **BUILT** | `HomeScreen.tsx` "Week streak" tile |
| 1.6 retention analytics | **STILL MISSING** — no analytics call sites anywhere; Sentry only | — |
| 2.1 in-session swap | **BUILT** — Day screen ⋯ → Replace Exercise → ranked picker. Commits to the local store, not `POST /exercises/replace` | `PlanCalendarExercisePickerScreen.tsx` |
| 2.2 "Short on time?" | **STILL MISSING** | — |
| 2.3 regen constraints | **STILL MISSING** — `GenerateSingleSessionDto` still has no equipment/injuries/experience, equipment is a two-value guess off `location`, no `cardioModalities`, and `generateSingleSession` still has zero frontend callers. The ⚠️ injury-safety issue is unchanged | `plans.service.ts`, `generate-single-session.dto.ts` |
| 2.5 dead "+ Add RPE" | **STILL DEAD**, but only in the orphaned file — unreachable | `WorkoutSession.tsx` |
| 3.1 coach note | **STILL MISSING** | — |
| 3.2 "Saved ✓" reflects the POST | **BUILT** — real `idle/saving/saved/error` state with a Retry | `PlanCalendarWorkoutCompleteScreen.tsx` |
| 3.3 share card snapshot | **STILL MISSING** — sharing is text-only and not on the finish screen | — |
| 3.4 instructions expanded / similar exercises | **STILL MISSING** (both) | `ExerciseDetailScreen.tsx` |
| 3.5 onboarding outlives its week | **BUILT** — by removal: onboarding now recommends a multi-week template instead of generating | `OnboardingScreen.tsx` |
| 3.6 generation wait screen | **PARTIAL** — Apply is gated and the web loader falls back; per-step narration still missing | `PlanPreviewScreen.tsx` |
| 4.1 401 refresh race | **STILL OPEN** — no single-flight refresh; sign-out fires on any failed refresh incl. network errors | `api/client.ts` |
| 4.2 false empty states | **PARTIAL** — plan surfaces distinguish offline/empty/loading; `ExerciseDetailScreen` still shows "Exercise not found" for a server-down load | `ExerciseDetailScreen.tsx` |
| 4.3 history `lb` + timed-as-reps | **FIXED 2026-08-26** | `CalendarScreen.tsx` |
| 4.4 cross-account draft leak | **STILL OPEN on this branch** — key is still device-global and sign-out never clears it. A fix commit exists on another branch and is not an ancestor of HEAD. Mitigated only by `loadWorkoutDraft` currently having zero callers | `workoutDraftStorage.ts` |
| 4.5 swap → dead slot survives Apply | **STILL OPEN** | `PlanPreviewScreen.tsx` |
| 4.6 move-to-occupied desync | **STILL OPEN** | `PlanPreviewScreen.tsx` |
| 4.7 bodyweight-only dead end | **FIXED 2026-08-26** — `Bodyweight → 'none'` mapped, and unmappable kit no longer yields an empty list | `GeneratePlanScreen.tsx` |
| 4.8 e1RM chart 40% floor | **STILL OPEN** — domain is still `[0, peak]` mapped onto `[40%, 100%]` | `ExerciseDetailScreen.tsx` |
| 4.9 3×10 for timed exercises | **FIXED 2026-08-26** | `SearchScreen.tsx`, `exercisePrescription.ts` |
| 4.10 month fetch failure | **PARTIAL** — plan errors surface with pull-to-refresh; the month **log** fetch still fails silently, so completed-day seals vanish with no signal | `planCalendarPrototypeStore.ts` |
| 4.11 "extend plan" promise | **FIXED 2026-08-26** — copy rewritten; nothing still promises extension | `HomeScreen.tsx` |
| 4.12 avatar menu at 76 pt | **FIXED** — the menu was removed; the avatar opens Profile directly | `HomeScreen.tsx` |
| 4.13 iOS-green switch | **FIXED** — dark mode is a themed segmented control; the remaining switches carry `trackColor`/`thumbColor` | `ProfileScreen.tsx` |
| 4.14 Plan tab paper cuts | **FIXED** — "Add workout for" and "Clear week" no longer exist; rest days read as rest; the Calendar tab legitimately wears the calendar icon | — |

---

## P0 — Stop the bleeding (fix before the next ship, in any vehicle)

These are the only items whose cost **grows** with delay: three write garbage into `WorkoutLog` rows that no later fix can clean, two are one-line embarrassments, and one is a scheduling decision that unblocks Week 3.

- [x] **0.1 Timed weighted sets inflate saved volume** `[OTA]` **S** — **fixed by the calendar rewrite** (verified 2026-08-26)
  Both producers now route reps through `sessionCelebration.parseRepsCount`, which returns 0 for any `min`/`sec` string, so a 45 s @ 70 lb carry books 0. `summarizeSessionTotals` still has no *intrinsic* timed guard — it is safe only because every current caller pre-parses. Test added for the loaded-hold case (`sessionCelebration.test.ts`, "books no volume for a LOADED hold").
  **Residual, needs a decision:** `sessionsFromWorkoutLogs` (`sessionCelebration.ts`) hardcodes `prescriptionType: 'reps'` when reading *stored* logs back, and legacy `WorkoutLog` rows written by the old session do hold seconds in `reps`. Re-summarising an old weighted hold from history would still inflate. Rolls into 0.4.

- [x] **0.2 kg users' stepper steps in pounds** `[OTA]` **S** — **fixed by the calendar rewrite** (verified 2026-08-26)
  There is no stepper any more. `PlanCalendarWorkoutScreen.tsx` labels the field `WEIGHT ({unit})` and converts on commit (`kgToLb` before storing canonical lb). The `[5, 2.5, 10]` chips survive only in the orphaned `WorkoutSession.tsx`.

- [ ] **0.3 Resumed drafts inflate workout duration** `[OTA]` **S** — **display fixed, persisted column now guarded; true fix still open** (2026-08-26)
  Mechanism moved: `dayStartTimes` (first logged set) survives restarts for 14 days, so a day left open books its whole wall-clock span. The finish screen already refused to print anything over 4 h; that same rule now gates the POST (`plausibleDuration` in `sessionCelebration.ts`, applied in `planCalendarPrototypeStore.ts`), so a run-away clock is **omitted** rather than written — `totalTimeSeconds` is nullable and `progressStats` already handles null.
  *Still to do:* this only stops the bad write. Duration is still wall-clock, not accumulated active time, so a genuine 3-hour gap inside a session is still counted, and rows written before this change are untouched (see 0.4).

- [ ] **0.4 History recompute decision + script** `[BE]` `[DECIDE]` **S–M**
  `totalVolume`/`totalTime` are **persisted columns** consumed by `progressStats.ts:163-164`. Fixing 0.1–0.3 does not fix rows already written. Raw sets are stored, so recompute is possible.
  *Done when:* an explicit decision is recorded (recompute vs. accept old rows), and if recompute: a script exists, was run against prod (with the prod-env-var trap from `.claude` skill notes respected), and Progress totals were re-verified.

- [ ] **0.5 Prefill reps from the next-target suggestion** `[OTA]` **S (not one line)** — **still open, different shape** (2026-08-26)
  The suggestion is now display-only: `PlanCalendarWorkoutScreen.tsx` builds `targetLine` from `suggestNextTarget(...)` and passes it to the deck as a **string**, which is only rendered. The inputs ghost from last session's same-numbered set (`lastSetForIndex`), never from the suggestion — for reps *or* weight. So the header can read "Target 6 · 145 lb ↑" while the untouched log commits last time's 5 × 140.

- [x] **0.6 Stop showing `SUPABASE_SERVICE_ROLE_KEY` to users** `[OTA]` **S (one line)** — **fixed 2026-08-26**
  The delete-account alert now states the consequence (data gone, the login may outlive it) and gives the support address, with no config internals. Zero occurrences of the var name remain in `frontend/src`.
  **The underlying deletion is still incomplete** unless `SUPABASE_SERVICE_ROLE_KEY` is set on the server — now declared in `render.yaml` as a `sync: false` var so the requirement is visible. Whether it is actually set in the Render dashboard could not be verified from the repo. Until it is, a deleted account's email can still sign in, which is an App Store 5.1.1(v) problem.

- [ ] **0.7 Real legal URLs in shipping builds** `[DECIDE]` **S** — **plumbing landed 2026-08-26; blocked on Dylan**
  The `example.com` fallbacks are gone. `constants/legalUrls.ts` now resolves each var to `string | null` (https only; placeholder hosts rejected), and Profile → About renders each row only when its URL is configured — hidden in production, shown as "Not configured" in dev.
  *Still needed, and only Dylan can do it:* (1) author or commission the actual policy text — `docs/legal/*.md` are explicitly non-binding placeholders; (2) host both at public https URLs; (3) add `EXPO_PUBLIC_PRIVACY_POLICY_URL` / `EXPO_PUBLIC_TERMS_OF_SERVICE_URL` to all three `eas.json` build profiles; (4) paste the privacy URL into App Store Connect → App Privacy. **ASC requires a publicly reachable URL of its own — an in-app screen does not satisfy it.**

- [x] **0.8 Dark-mode CTA contrast token** `[OTA]` **S (one token)** — **fixed by the Blackout palette** (verified 2026-08-26)
  The gold palette was replaced wholesale. Dark is now `onPrimary #0A0D13` on `primary #3D8CFF` (~7.6:1); light `textMuted #6B6B70` on `#F2F2F7` (~4.75:1). `Button.tsx` still reads the same two tokens, so the fix is app-wide.

- [ ] **0.9 Decide + submit the next native binary NOW** `[BINARY]` `[DECIDE]` **S to decide**
  The audit's sequencing breaks in its own Week 2: `expo-notifications` is **not** in the app binary, so notifications (and the rest timer's "notify when backgrounded" flourish) cannot ship OTA. Verified OTA-safe already: `expo-keep-awake` (ships inside the `expo` core package), `expo-haptics`, Skia.
  *Done when:* binary contents decided (expo-notifications yes; `react-native-webview` only if in-app video survives planning; **not** `react-native-view-shot` — use Skia snapshots), build submitted to TestFlight so Apple review runs in parallel with all OTA work below.

---

## P1 — Own the rest period (Bet 1, all OTA) + make the streak visible

The #1 at-the-gym gap and the cheapest big win. 70% of gym time is between sets and the app is silent there; Strong/Hevy's habit loop lives exactly here. Everything in this tier ships OTA today.

- [x] **1.1 Auto-start rest timer on set completion** `[OTA]` **M** — **DONE 2026-08-27 (`8418786`).**
  Partly existed already in the live calendar session (this item was written against the orphaned file, so it read as unstarted). What was missing was correctness: the countdown was a `setTimeout` chain decrementing a counter, so it advanced only while JS ran and **froze whenever the phone locked** — the most common thing anyone does during rest. `lib/restTimer.ts` now stores the end instant and derives the remainder from `Date.now()`.
  Deviations from the spec below, both deliberate: there is **no countdown ring** (the REST tile shows the digits and, new, what it is counting down *from*), and "state survives draft save/restore" is moot because the draft system was deleted — the timer instead survives navigation as a module singleton and survives a locked screen by construction. The haptic additionally declines to fire when it only noticed late.
  Use the prescription's `restSeconds` — it already arrives in the workout payload (`workoutService.ts:68`), renders in preview (`PlanPreviewScreen.tsx:1588`), and is discarded by the session. A designed-but-never-built timer state model already exists (`types/workout.ts:79-90` — note both `WorkoutSession.tsx:78` and `WorkoutScreen.tsx:36` declare local interfaces that shadow it; reconcile). Visible countdown ring + big numbers + haptic at zero. **Defer** the backgrounded local notification to 2.4 (needs the binary).
  *Done when:* completing a set starts a countdown from that exercise's `restSeconds` (sane default when absent), skippable, haptic at 0, state survives draft save/restore.

- [x] **1.2 Keep the screen awake during a session** `[OTA]` **S** — **DONE 2026-08-27 (`8418786`).**
  Held while sets remain or a rest is running, released on unmount. ⚠ `activateKeepAwakeAsync` AND `deactivateKeepAwake` both return promises and both can reject (denied without a user gesture on web; "has not activated yet" when releasing a lock that was never granted). A sync `try/catch` does not catch either — it surfaces as an unhandled rejection.
  No keep-awake anywhere; screen locks mid-workout, every rest ends in FaceID. `useKeepAwake()` is a one-line import — the native module is already compiled into shipped builds via the `expo` package.
  *Done when:* active session never auto-locks; deactivates on finish/exit.

- [ ] **1.3 Elapsed clock in the session header** `[OTA]` **S**
  `Elapsed` currently renders only when ETA is null, which never happens (`WorkoutSession.tsx:377-381`) — yet a per-second ticker already re-renders the whole session for a number only shown at the finish. Show the clock; scope the ticker so the timer/clock re-render doesn't drag the whole exercise list.
  *Done when:* clock always visible in-session; ticker re-render scoped to the header/timer subtree.

- [ ] **1.4 Success haptics on set-complete and finish** `[OTA]` **S**
  `expo-haptics` + `lib/haptics.ts` exist and are spent entirely on onboarding. Set completion gets the generic tick; the finish moment gets nothing.
  *Done when:* distinct success haptic on set-complete; notification-success haptic on workout finish.

- [ ] **1.5 Streak number + flame on Home** `[OTA]` **S**
  The 4-week streak — the one hook the data already computes — is invisible on Home (only occurrence is a link-card subtitle, `HomeScreen.tsx:786`); it lives two navigations deep on Progress.
  *Done when:* Home header shows current streak from the already-fetched stats; taps through to Progress.

- [ ] **1.6 Minimal retention analytics** `[OTA/BE]` **S**
  Sentry catches crashes only; nothing measures whether any of this works. Without it, a month of retention work is judged by texting friends.
  *Done when:* either (a) minimal events (session_started/finished, screen_view) recorded, or (b) an explicit decision to use server-side workout-save timestamps as the retention proxy is written down.

---

## P2 — Unfreeze the plan (Bet 3) + give the app a voice (Bet 4)

The product's identity is "AI workout plans," and today every intelligent lever dies at Apply. These answer "machine taken," "only 30 minutes," and "why would I reopen the app."

- [ ] **2.1 In-session "Swap exercise"** `[OTA]` `[BE ready]` **M**
  Wire the session ⋯ menu to the catalog replace endpoint (same muscle, pattern-deduped) — today it's called from exactly one place (`PlanPreviewScreen.tsx:845`), and the session's "No library page" alert literally tells users to do it manually (`WorkoutSession.tsx:779-786`). Hidden state costs to handle: sets already logged on the swapped-out exercise (v1 may drop them — decide), draft persistence of the swap, last-performance/PB refetch for the new exercise id, and whether the swap edits the plan's workout row or only this session.
  *Done when:* two taps swap a taken machine mid-session; draft-safe; logs attribute to the new exercise; decision on plan-row mutation recorded.

- [ ] **2.2 "Short on time?" on today's card** `[OTA]` **M**
  Deterministic trim to ~30 min: drop/trim accessories using catalog role data (compound/isolation is populated on all 1,299 rows and surfaced nowhere). No LLM call needed.
  *Done when:* one tap produces a trimmed session honoring the anchor lifts; estimate shown via `estimateWorkoutMinutes`.

- [ ] **2.3 Fix regen constraint-dropping, then "Regenerate this day"** `[BE]` `[OTA]` **M — dependency ordered**
  Blocked-by-design today: regen drops equipment/injuries/goal/experience (⚠️ safety issue for injuries — `docs/future.md:248-277`). Take future.md **option 1** (frontend sends current prefs, no migration). Also plumb `cardioModalities` into `GenerateSingleSessionDto` (`future.md:184-187`). Then expose the zero-caller `generate-single-session` endpoint (`planService.ts:291` wrapper exists, uncalled) on Plan day slots.
  *Done when:* constraint fix lands with tests **first**; day-regen UI ships after; a home/injury user's regen never reintroduces excluded equipment/moves.

- [ ] **2.4 Notifications — three messages, all local** `[BINARY]` **M**
  Requires the 0.9 binary (submitted in Week 1, approved by now). All three can be **local scheduled** notifications — no push infra, no Expo push credentials, recap stats computed on-device: (1) workout-day reminder at the user's usual hour (derivable from log history), (2) streak-about-to-break on the week's last possible day, (3) Sunday recap ("3 sessions, 12,400 lb, 2 PRs"). Design the permission prompt moment (after first finished workout, not at install).
  *Done when:* all three fire correctly in local testing; permission asked at a warm moment; settings toggle exists; rest-timer's backgrounded notification (deferred from 1.1) also lands here.

- [ ] **2.5 Resolve the dead "+ Add RPE" menu item** `[OTA]` **S**
  `showAdvancedLogging` is toggled, persisted in drafts, and never renders anything (`WorkoutSession.tsx:1747-1754` vs `:1158`) — confirmed live: tapping it does nothing. The `rpe` field plumbing exists (`:470-471`).
  *Done when:* either an RPE input actually renders when toggled, or the menu item is removed. No dead controls.

---

## P3 — The AI gets a voice, the finish gets a face (Bets 2 + 5 + 6-lite)

- [ ] **3.1 Post-workout coach note — descriptive-only v1** `[BE]` `[OTA]` **M (not "S, days")**
  One Groq call at finish: 2–3 sentences on what happened. **Trust guardrail (non-negotiable):** the app's differentiator is that it never lies — so all numbers/facts must be computed deterministically (`sessionAchievements`/`progressStats`) and passed to the LLM, which does *phrasing only*; the note must be **descriptive, never promissory** ("we'll hold 145 Thursday" promises adaptation the frozen plan cannot perform — that copy is banned until 2.x makes plans bend). Prerequisites the audit missed: the finish screen renders **before** the log POSTs (`WorkoutSession.tsx:2071-2077` → `WorkoutScreen.tsx:641`) so the note needs its own payload path or a save-first refactor; planned-vs-actual is unrecoverable server-side (uncompleted sets filtered before write — `docs/future.md:236`) so "vs plan" claims come from the client payload; new AI surface = throttler budget (`ai-throttler.guard.ts`), offline/timeout fallback (render nothing, never a spinner at the emotional peak), and an eval-style prompt test in keeping with repo culture.
  *Done when:* note renders on finish (async-safe, absent on failure), pinned to Home until the next session; a test asserts the prompt only receives precomputed facts.

- [ ] **3.2 Finish screen worth the moment** `[OTA]` **M**
  Count-up animation on tiles, streak line ("4-week streak alive" was true and unsaid in the live run), coach note slot (3.1), success haptic (from 1.4). Also fix the sequencing lie: "Saved ✓" flips before the POST starts (`WorkoutSession.tsx:2071-2077`; failure *does* alert — `WorkoutScreen.tsx:657-661` — the bug is the premature checkmark, not silence).
  *Done when:* saved-state reflects actual POST result; the screen has motion and the streak line.

- [ ] **3.3 Share card via Skia snapshot** `[OTA]` **M**
  Dark-gold card (session name, volume, PRs, streak) → native share sheet. Use `@shopify/react-native-skia` (already shipped, `package.json:33`) to render offscreen and snapshot — **do not** add `react-native-view-shot` (native dep that would silently make this binary-gated). For an iMessage friends beta this is the only realistic growth loop; the QR share can't acquire users (auth-gated, scheme-only, sender sees nothing).
  *Done when:* share sheet opens with a rendered image from the finish screen; card looks intentional in both themes.

- [ ] **3.4 Exercise-knowledge cherry-picks (no video program yet)** `[OTA]` **S each**
  (a) Instructions **expanded** on first visit instead of collapsed; (b) "Similar exercises" on detail via the replace endpoint, read-only. The 150-video curation program stays on the wall (P5) — it's a content treadmill and embedding needs a webview decision (0.9).
  *Done when:* both live on ExerciseDetail; video decision explicitly deferred.

- [ ] **3.5 Onboarding auto-plan should outlive its week** `[OTA/BE]` **S–M**
  The payoff plan is "Week 1 of 1" — signing up Thursday means it's 60% elapsed at birth and the app's next message is effectively "generate again."
  *Done when:* onboarding generates a multi-week plan (multi-week is verified solid) or the 1-week plan flows into a "next block" prompt instead of a dead end.

- [ ] **3.6 Generation wait screen worth the magic** `[OTA]` **S–M**
  ~30 s on a black screen with one static line; the Skia bench-press loader doesn't render on web at all; and "Apply to Plan" stays visible and gold *during* generation. The most magical moment the product has is its emptiest screen (audit §2).
  *Done when:* the wait shows per-step narration or staged progress (scripted is fine), Apply is hidden/disabled until generation completes, and web gets a non-Skia loader fallback.

---

## P4 — Reliability, error honesty, and the rest of the verified bug list

None of these corrupt data (that was P0), but each is a live paper cut. Ordered roughly by user pain.

- [ ] **4.1 401 refresh race signs users out** `[OTA]` **M** — concurrent Home+Plan requests on app-open can both 401 and force sign-out (`docs/future.md:189-195`). A retention bug by the audit's own framing; the retention section omitted it. *Done when:* sign-out only on definitive invalid-refresh-token.
- [ ] **4.2 False empty states from catch blocks** `[OTA]` **S** — server down renders "No plan yet" (`WorkoutScreen.tsx:555-559`) and "Exercise not found" (`ExerciseDetailScreen.tsx:337-341`). *Done when:* error state + retry, distinct from true-empty.
- [x] **4.3 History day view: hardcoded "lb", timed sets as reps** `[OTA]` **S** — **fixed 2026-08-26.** `CalendarScreen.tsx` now reads `weightUnit` and renders through `formatWeightCompactFromLb`; timed rows print as a duration (`45s @ 70 lb`), reusing `MIN_PLAUSIBLE_DURATION_SECONDS` so a legacy cardio rep count is not rendered as "1s".
- [ ] **4.4 Cross-account draft leak** `[OTA]` **S** — draft key is device-global (`workoutDraftStorage.ts:4`) and sign-out never clears it (`AuthContext.tsx:173-186`); user B can resume user A's workout. *Done when:* per-user key + cleared on sign-out.
- [ ] **4.5 Preview "Swap Workout" creates a dead slot that survives Apply** `[OTA]` **S–M** — `PlanPreviewScreen.tsx:908-957`; Start dead-ends on an exercise-less workout.
- [ ] **4.6 Preview move-to-occupied-day desyncs UI from draft** `[OTA]` **S–M** — `PlanPreviewScreen.tsx:754-789` vs `:962-985`; applied plan gets a doubled day + a lost session.
- [x] **4.7 Bodyweight-only onboarding dead-ends** `[OTA]` **S** — **fixed 2026-08-26.** `PREF_EQUIPMENT_MAP` now maps `Bodyweight → 'none'`, and `prefEquipmentToForm` falls back to `['none']` rather than `[]` when a profile lists only kit the form has no word for (TRX, medicine ball, battle rope — still unrepresented). That was the empty list behind a full-colour "Generate Plan" button that silently returned. *Open behind it:* the form still has no vocabulary for those three, and a bodyweight-only profile still defaults `primaryLocation` to `'gym'`, which hides the equipment selector.
- [ ] **4.8 e1RM trend chart illegible by construction** `[OTA]` **S** — peak-scaled with a 40% floor (`ExerciseDetailScreen.tsx:559-563`; the audit said "min-max" — mechanism corrected, conclusion holds): a 158→169 lb trend renders as 96%-vs-100% bars. *Done when:* y-domain fits the data range (nice-min to nice-max), trend visible.
- [x] **4.9 Add-from-search hardcodes 3×10 even for timed exercises** `[OTA]` **S** — **fixed 2026-08-26.** Both add paths in `SearchScreen.tsx` now call `defaultPrescriptionForNewExercise` (`lib/exercisePrescription.ts`): holds get `3 × 45 s`, cardio gets one 10-minute block, everything else keeps `3 × 10`. The payload path already carried `durationSeconds`/`prescriptionType`.
- [ ] **4.10 Calendar month fetch failure: no retry, falsely-empty grid** `[OTA]` **S** — `CalendarScreen.tsx:180-186`.
- [x] **4.11 Remove or build the "extend plan" promise** `[OTA]` **S** — **fixed 2026-08-26.** The `GeneratePlanScreen` copy was already gone; the last one on Home is rewritten. While there: four places still told users to "Open Plan" or "use the week arrows on Plan" — a tab that no longer exists — now all name Calendar (`HomeScreen.tsx` ×3, `SearchScreen.tsx` ×1). Note the out-of-program card fires **before** a program starts, not after (running past the last week resolves to `in_program`, repeating it), so the copy no longer implies the plan ended.
- [x] **4.12 Home avatar menu anchored at magic 76 pt** `[OTA]` **S** — **fixed**: the menu was removed entirely; the avatar opens Profile directly.
- [x] **4.13 iOS-green dark-mode switch in a gold app** `[OTA]` **S** — **fixed**: dark mode is a themed segmented control, and every remaining `<Switch>` in the app carries `trackColor`/`thumbColor` from the palette.
- [x] **4.14 Plan tab framing paper cuts** `[OTA]` **S** — **fixed** by the Calendar tab replacing Plan+Train. "Add workout for" and "Clear week" have zero matches in `frontend/`; rest days read "Rest day — nothing scheduled."; the icon/label mismatch is gone by construction.

---

## P5 — The wall (validated, deliberately not now)

Keep these visible; do not let them jump the queue.

- [ ] **5.1 Records / PR-history screen** — persist achievements as events at save time; today PRs are shown once on the finish screen and are never findable again. Once persisted, badge PR days on the History calendar (day view currently has no PR markers).
- [ ] **5.2 Rep-PRs and e1RM-PRs** — only heavier-weight PRs exist (`sessionAchievements.ts:202,210` — both comparisons weight-only); on double-progression most real progress is invisible. The e1RM engine already exists (`exerciseHistory.ts`).
- [ ] **5.3 Plan-end celebration + next-block carry-over** — a finished block currently ends in a gray "Repeating week N" banner and a blank wizard; block-over-block lift data exists.
- [ ] **5.4 Plan management** — list/switch/rename/delete; today creating a plan strands the old one forever (`getPlanById`/`updatePlan` have zero callers). Include post-apply editing of prescriptions (sets/reps/rest) — a Strong/Hevy table stake (audit §4).
- [ ] **5.5 Sets-per-muscle weekly split as a body-map heat view** — per-week `totalSets`/`volumeLb` computed and never rendered (`progressStats.ts:156-165`); the body-map assets are an ownable visual no competitor has.
- [ ] **5.6 Quick-log / empty workout + custom exercises** — the two biggest "life happens" gaps; already scoped in `docs/future.md:216-224`. Also heals the severed search→action path (today finding "cable row" ends at an info page unless you entered from a session's add-mode, which is itself blocked until the workout is saved — audit §3.4).
- [ ] **5.7 Server-side preferences** — reinstall/new phone wipes identity and forces re-onboarding (`future.md:240-246`); move injury notes out of plaintext AsyncStorage while at it.
- [ ] **5.8 In-app exercise video program** — ~150 curated embeds for the exercises generation actually emits (generation logs identify them); needs the webview binary decision (0.9) and content curation. `youtubeId` pipeline is fully plumbed with 1 mapping. Related knowledge gap: "how much should I start with?" — the app owns goal/experience and a full e1RM engine and never suggests a starting weight (audit §3.5).
- [ ] **5.9 Superset / circuit support** — the form already asks (`straight sets | supersets | circuit`, `GeneratePlanScreen.tsx:100`), the generator has no representation, the session can't render it. Either build it end-to-end or stop asking.
- [ ] **5.10 IA + design-system pass** — Profile's hidden door (only via Home avatar menu; sign-out lives only there too), Progress/History buried in the Plan stack, type/spacing/radius scales (545 raw fontSize literals, 20 values), consolidate the five feedback systems (71 `Alert.alert` + 2 toasts + 2 inline styles), and a motion rebalance: 100% of the animation budget is spent before login while WorkoutSession/Home/Progress/finish are static (audit §3.7; 3.2 covers the finish screen only).
- [ ] **5.11 Sharing that can acquire users** — https universal links, redeem-without-account path, sender-visible redemptions.
- [ ] **5.12 Plate calculator, warm-up ramp in session, body measurements/photos, Apple Health/Watch** — competitor-table gaps, post-beta.
- [ ] **5.13 Workout-deletion semantics (§6.5)** — decide `SetNull` vs refuse-if-logs **before any delete affordance ships** (`future.md:230-234`).
- [ ] **5.14 Edit/delete/annotate past logs** — a typo'd 500 lb curl silently poisons PRs, prefill, and volume *forever*, undermining the app's hard-won honesty guarantees (audit §3.6). Deletes are gated on the 5.13 decision; edits can ship independently.
- [ ] **5.15 Progress v2 trend pack** — volume trend, per-exercise strength trend, duration trend, body-weight presence + goal weight on Progress (body weight is currently an island under Profile). Per-week `totalSets`/`volumeLb` are already computed and never rendered (`progressStats.ts:156-165`); replace hand-rolled floor-clamped flex bars with a real chart primitive for continuous series (audit §3.6).
- [ ] **5.16 Catalog-powered search filters** — difficulty, position, unilateral, compound/isolation are populated on all 1,299 rows and surfaced nowhere (audit §3.5).
- [ ] **5.17 Front door that sells** — the login screen before onboarding is a bare Email/Password form with zero pitch; a friend clicking an invite link sees no reason to sign up (audit §2). Pairs with 5.11.
- [ ] **5.18 Adaptive-plan acknowledgments** — missed week (calendar currently marches on silently), deload on demand, mid-plan injury accommodations (audit §3.2). The conversational layer on top of the 2.x escape hatches.
- [ ] **5.19 Parked items tracked elsewhere** — generation-quality watch list (`docs/future.md`; the audit's live run reproduced press-redundancy / pull-ratio / ordering items), UTC month-window decision for Progress stats (2026-07-29 handoff §2), on-device verify of timed history rows on a real iPhone. Don't duplicate tracking here — this line is a pointer.

---

## Doc housekeeping — amendments to `2026-07-30-app-deep-dive.md`

Small factual corrections in place; this checklist supersedes the audit's §7 sequencing.

- [ ] **D.1** TL;DR §0.2: replace endpoint has **one** caller (plan preview), not zero — the doc's own §3.4 is correct; keep "zero callers" only for `generate-single-session`/`getPlanById`/`updatePlan`.
- [ ] **D.2** Bet 3.4: "one-line fix" → small fix requiring a touched-reps sentinel (see 0.5).
- [ ] **D.3** §6.4: e1RM chart mechanism is peak-scaled + 40% floor, not min-max (conclusion unchanged).
- [ ] **D.4** §6.8: save-failure does alert (`WorkoutScreen.tsx:657-661`); the bug is the premature "Saved ✓", not silence.
- [ ] **D.5** Scorecard: set-logging core → "Strong (display) / Suspect (data layer)" — four of the audit's own bugs live in that surface.
- [ ] **D.6** Bet 2: reprice S→M; add the descriptive-only trust guardrail and the two dependencies (finish-before-save flow, planned-vs-actual gap at `future.md:236`).
- [ ] **D.7** Bet 5: specify Skia snapshot, not `react-native-view-shot`.
- [ ] **D.8** §7: strike "every step ships OTA" (false for Week 2); point to this checklist as the operative sequencing.

---

### Suggested week mapping (if the month starts now)

**W1** = all of P0 + 1.1–1.6 · **W2** = 2.1–2.3, 2.5 · **W3** = 2.4 (binary approved), 3.1, 3.5 · **W4** = 3.2–3.4, 3.6, then bites of P4 (4.1–4.4 first). P4 items also make good gap-fillers any week; P5 items only by explicit decision.
