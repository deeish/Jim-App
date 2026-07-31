# Jim — prioritized action checklist

**Source:** `2026-07-30-app-deep-dive.md` (the audit) + the 2026-07-31 two-agent review pass that verified ~28 of its claims and re-sequenced the plan.
**Sorting:** P0 → P5, most important first. Within a tier, items are also roughly ordered.
**Tags:** `[OTA]` ships over-the-air today · `[BINARY]` requires the next native TestFlight build · `[BE]` backend (auto-deploys via Render) · `[DECIDE]` a decision, not code · `[DOC]` documentation change. Effort: **S** = hours, **M** = days, **L** = week+.

Why this order: P0 items either **corrupt permanent data on every use** (cost compounds daily) or are trivial embarrassment/review risks; P1 is the single biggest daily-use gap; P2 unfreezes the product's identity; P3 gives it a voice and a face; P4 is reliability debt; P5 is the wall.

---

## P0 — Stop the bleeding (fix before the next ship, in any vehicle)

These are the only items whose cost **grows** with delay: three write garbage into `WorkoutLog` rows that no later fix can clean, two are one-line embarrassments, and one is a scheduling decision that unblocks Week 3.

- [ ] **0.1 Timed weighted sets inflate saved volume** `[OTA]` **S**
  `sessionAchievements.ts:141-149` adds `reps × weight` with no timed-row exclusion, so a 45 s @ 70 lb carry books **3,150 lb** into the finish screen and the persisted `totalVolume` (`WorkoutScreen.tsx:648`). The same file already special-cases timed rows everywhere else (`:76-77`, `:273-277`) — the totals function is the only one that forgot.
  *Done when:* timed rows contribute 0 (or a deliberate formula) to volume; unit test on a mixed timed/reps session; finish-screen total matches.

- [ ] **0.2 kg users' stepper steps in pounds** `[OTA]` **S**
  Step chips are fixed `[5, 2.5, 10]` (`WorkoutSession.tsx:1645`) and the delta is added raw to canonical-lb weight (`:490-491`), so a kg user's "+5" = +5 lb = +2.27 kg (20.0 → 22.3 kg). The typed-in path (`:1599`) and edit modal (`:1796,1851`) convert correctly — only the stepper is wrong, and it's the fast path.
  *Done when:* stepper deltas are converted for kg users (or chips become unit-aware); test covering both units.

- [ ] **0.3 Resumed drafts inflate workout duration** `[OTA]` **S**
  `totalTime = now − session.startTime` (`WorkoutSession.tsx:716-717`) and resume restores the original start (`WorkoutScreen.tsx:617`), so resuming yesterday's draft books a ~14-hour workout into persisted `totalTime`.
  *Done when:* duration is derived from accumulated active time (or capped/re-based on resume); resume-after-a-day yields a sane duration; test added.

- [ ] **0.4 History recompute decision + script** `[BE]` `[DECIDE]` **S–M**
  `totalVolume`/`totalTime` are **persisted columns** consumed by `progressStats.ts:163-164`. Fixing 0.1–0.3 does not fix rows already written. Raw sets are stored, so recompute is possible.
  *Done when:* an explicit decision is recorded (recompute vs. accept old rows), and if recompute: a script exists, was run against prod (with the prod-env-var trap from `.claude` skill notes respected), and Progress totals were re-verified.

- [ ] **0.5 Prefill reps from the next-target suggestion** `[OTA]` **S (not one line)**
  The coach line says "145 lb × 6 — add a rep" while the stepper seeds plan-minimum reps (`WorkoutSession.tsx:119-122`); the prefill effect (`:245-272`) resolves **weight only** (`lastPerformanceDisplay.ts:88-133`). The big gold button logs *below* last session. Note: the weight prefill uses `weight === 0` as its "untouched" sentinel — reps have no sentinel, so this needs its own touched-set guard. Sets after the first copy the previous set (`:440-445`), so set 1 is the fix point.
  *Done when:* untouched set-1 reps seed from the suggestion; user-edited reps are never clobbered; test for both.

- [ ] **0.6 Stop showing `SUPABASE_SERVICE_ROLE_KEY` to users** `[OTA]` **S (one line)**
  `ProfileScreen.tsx:527` puts the server env-var name verbatim in a user-facing alert.
  *Done when:* copy says something like "your account data was deleted; sign-in removal may take longer" with no config internals.

- [ ] **0.7 Real legal URLs in shipping builds** `[DECIDE]` **S**
  `constants/legalUrls.ts:6-13` falls back to `example.com/privacy|terms` unless `EXPO_PUBLIC_*` vars are set in the build. App Store review risk + trust hit.
  *Done when:* hosted policy pages exist, env vars are set in EAS build profiles, and a production build opens the real pages.

- [ ] **0.8 Dark-mode CTA contrast token** `[OTA]` **S (one token)**
  `onPrimary #F4F1EA` on gold `#C7A46A` = **2.08:1** (independently recomputed; fails WCAG even for large text) on every shared-Button primary action (`Button.tsx:56`, `theme/colors.ts:52,64`). Home already uses the correct dark-on-gold (8.07:1). While in the file: light mode's `textMuted` (2.53:1 at 11–13 px) is the same class of problem.
  *Done when:* dark `onPrimary` is a dark ink on gold app-wide; light `textMuted` raised or usage shrunk; spot-check both themes.

- [ ] **0.9 Decide + submit the next native binary NOW** `[BINARY]` `[DECIDE]` **S to decide**
  The audit's sequencing breaks in its own Week 2: `expo-notifications` is **not** in the app binary, so notifications (and the rest timer's "notify when backgrounded" flourish) cannot ship OTA. Verified OTA-safe already: `expo-keep-awake` (ships inside the `expo` core package), `expo-haptics`, Skia.
  *Done when:* binary contents decided (expo-notifications yes; `react-native-webview` only if in-app video survives planning; **not** `react-native-view-shot` — use Skia snapshots), build submitted to TestFlight so Apple review runs in parallel with all OTA work below.

---

## P1 — Own the rest period (Bet 1, all OTA) + make the streak visible

The #1 at-the-gym gap and the cheapest big win. 70% of gym time is between sets and the app is silent there; Strong/Hevy's habit loop lives exactly here. Everything in this tier ships OTA today.

- [ ] **1.1 Auto-start rest timer on set completion** `[OTA]` **M**
  Use the prescription's `restSeconds` — it already arrives in the workout payload (`workoutService.ts:68`), renders in preview (`PlanPreviewScreen.tsx:1588`), and is discarded by the session. A designed-but-never-built timer state model already exists (`types/workout.ts:79-90` — note both `WorkoutSession.tsx:78` and `WorkoutScreen.tsx:36` declare local interfaces that shadow it; reconcile). Visible countdown ring + big numbers + haptic at zero. **Defer** the backgrounded local notification to 2.4 (needs the binary).
  *Done when:* completing a set starts a countdown from that exercise's `restSeconds` (sane default when absent), skippable, haptic at 0, state survives draft save/restore.

- [ ] **1.2 Keep the screen awake during a session** `[OTA]` **S**
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
- [ ] **4.3 History day view: hardcoded "lb", timed sets as reps** `[OTA]` **S** — `CalendarScreen.tsx:39,44`; the exact class of bug just fixed on ExerciseDetail, still live one screen over. *Done when:* unit-aware weights, timed rows render as time.
- [ ] **4.4 Cross-account draft leak** `[OTA]` **S** — draft key is device-global (`workoutDraftStorage.ts:4`) and sign-out never clears it (`AuthContext.tsx:173-186`); user B can resume user A's workout. *Done when:* per-user key + cleared on sign-out.
- [ ] **4.5 Preview "Swap Workout" creates a dead slot that survives Apply** `[OTA]` **S–M** — `PlanPreviewScreen.tsx:908-957`; Start dead-ends on an exercise-less workout.
- [ ] **4.6 Preview move-to-occupied-day desyncs UI from draft** `[OTA]` **S–M** — `PlanPreviewScreen.tsx:754-789` vs `:962-985`; applied plan gets a doubled day + a lost session.
- [ ] **4.7 Bodyweight-only onboarding dead-ends** `[OTA]` **S** — equipment map drops Bodyweight/TRX/Medicine Ball/Battle Rope (`GeneratePlanScreen.tsx:334-343`), readiness fails, "Get my plan" breaks its promise. Open since the June review.
- [ ] **4.8 e1RM trend chart illegible by construction** `[OTA]` **S** — peak-scaled with a 40% floor (`ExerciseDetailScreen.tsx:559-563`; the audit said "min-max" — mechanism corrected, conclusion holds): a 158→169 lb trend renders as 96%-vs-100% bars. *Done when:* y-domain fits the data range (nice-min to nice-max), trend visible.
- [ ] **4.9 Add-from-search hardcodes 3×10 even for timed exercises** `[OTA]` **S** — `SearchScreen.tsx:869-871`, `:961-963`.
- [ ] **4.10 Calendar month fetch failure: no retry, falsely-empty grid** `[OTA]` **S** — `CalendarScreen.tsx:180-186`.
- [ ] **4.11 Remove or build the "extend plan" promise** `[OTA]` **S** — promised at `GeneratePlanScreen.tsx:1254` and `HomeScreen.tsx:644`; repo-wide grep confirms nothing implements it. Kill the copy now; building extension is P5.
- [ ] **4.12 Home avatar menu anchored at magic 76 pt** `[OTA]` **S** — `HomeScreen.tsx:797` (+`:1025`), inside a Modal that escapes SafeAreaView; wrong on every notched iPhone = every beta tester.
- [ ] **4.13 iOS-green dark-mode switch in a gold app** `[OTA]` **S** — theme the Profile switches with the token palette.
- [ ] **4.14 Plan tab framing paper cuts** `[OTA]` **S** — rest days render as "**Add workout for Wednesday**" (recovery reframed as a gap to fill — label them Rest/Recovery); destructive red "Clear week" visually outranks the day list; the Plan tab wears a calendar icon while hiding the calendar (audit §2, §3.7).

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
