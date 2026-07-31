# Jim — full-app deep dive: what's weak, what's missing, and why it doesn't pull you back yet

**Date:** 2026-07-30 · **Tree audited:** `feat/progress-finish-screen` working tree (all uncommitted review fixes included)
**Method:** six parallel code-audit agents (gym session, plan lifecycle, progress/history, search/catalog, onboarding/profile, design system) + a full live walkthrough of the running app (local backend + Expo web, authenticated via the session bypass, real Groq generation, 4 weeks of seeded history, a complete logged workout driven end-to-end). Every load-bearing claim below was either verified live or carries file:line evidence from an agent pass.

---

## 0. TL;DR — the honest answer to "why don't I want to use this?"

The app records workouts honestly and generates decent plans, but **it has no relationship with you**. It acts once (generation day) and reacts never. Concretely, four compounding absences:

1. **It is silent during rest — the 70% of gym time between sets.** No rest timer, no keep-awake, no visible clock, no haptic on set completion. Your screen locks, you check Instagram, the app is a logbook you visit. Strong/Hevy own exactly this stretch — auto-started rest countdown with a notification — and it's their habit loop. The cruelest detail: the backend computes per-exercise rest (`90s`, `2m30s`), Plan Preview *displays* it, and the live session throws it away. A rest-timer state model even exists in `types/workout.ts:79-90` — designed, never built.
2. **The AI coach evaporates after day one.** Every intelligent lever — replace exercise, rebuild week, reduce intensity, edit inputs — is **preview-only**. Once you tap Apply, the plan is frozen: no swap when a machine is taken, no 30-minute version of today, no reaction to you crushing or missing targets (generation never reads your logs), no acknowledgment when you miss a week, and plan completion is a gray "Repeating week N" banner. The product's identity is "AI workout plans," but after apply the AI is a form processor you already used. Meanwhile `POST /plans/generate-single-session` and the catalog-replace endpoint sit on the backend **with zero UI callers**.
3. **Nothing ever pulls you back in.** Zero notification infrastructure (no `expo-notifications`, no reminders, no streak-danger nudge, no weekly recap). The 4-week streak — the one hook the data already computes — is invisible on Home; it lives two navigations deep. PRs are shown once on the finish screen and are never findable again (no records list, no PR feed, no share card). The retention loop is 100% pull-based, and what would be pulled toward is buried.
4. **The app only supports the day going exactly as planned.** No quick-log/empty workout ("walked in, just want to train"), no custom exercises (your gym's weird machine can't be tracked), no mid-session substitution, and search-to-action is read-only. Real gyms never go as planned; every deviation ends in Skip (lost volume) or leaving the app.

Everything else — design drift, thin progress screen, YouTube-outsourced exercise guidance — is real but secondary to those four.

**The inverse, to be fair:** the set-logging core is genuinely better than it has any right to be. One-tap set completion, last-time line + next-target suggestion ("145 lb × 6 — add a rep"), crash-safe drafts, and an achievements engine that never lies (PRs must actually beat something). The finish screen fired two honest "up from X lb" PRs in my live run, exactly correct. The foundation for a great gym app is here; the tissue that makes people *return* is what's missing.

---

## 1. Scorecard by area

| Area | Verdict | One-line reason |
|---|---|---|
| Set logging core (live session) | **Strong** | 1-tap logging, honest prefill/next-target, crash-safe drafts |
| Onboarding → first plan | **Strong-** | Best-crafted flow in the app; but front door sells nothing and auto-plan is 1 week |
| Plan generation & preview | **Good** | Real transparency ("what drove this"), fast (~30s live); wait is a blind black screen |
| Plan *lifecycle* after apply | **Weakest in product** | Frozen plan, zero adaptations, anticlimax ending, one-plan-forever |
| Rest-time experience | **Missing entirely** | No timer / keep-awake / clock / haptics — the #1 competitor feature |
| Progress & history | **Adequate-** | Honest but thin; answers "did I show up," never "am I getting stronger" |
| Retention infrastructure | **Missing entirely** | No notifications, buried streak, evaporating PRs, no social loop |
| Exercise knowledge | **Weak** | 4 collapsed generic steps + "search YouTube yourself"; 1 of 1,299 videos mapped, never rendered |
| Search & catalog | **Good** | Typo-tolerant search, body-map tiles, variant grouping; but read-only dead end |
| Ad-hoc training | **Missing** | No empty workout, no custom exercises, no quick-log (both already in `docs/future.md`) |
| Sharing | **Weak** | QR/code works but auth-gated, scheme-only links, sender sees nothing — buddy feature, not growth |
| Design system | **Mixed** | Excellent color/token discipline ("Iron & Sand" is a real identity); no type/spacing/radius scale, CTA contrast bug, polish is front-door-only |
| Information architecture | **Mixed** | 4 tabs is right; Profile has one hidden door, Progress/History buried in the Plan stack |

---

## 2. The live walkthrough — first-person, as a user

What I actually did: fresh account → onboarding → "Get my plan" (real Groq call) → applied → seeded realistic history (13 sessions / 4 weeks) → drove today's Upper·B end-to-end → finish screen → Progress, History, Exercise detail, Plan, Profile.

**Onboarding (genuinely good).** Aurora welcome, 7 fast steps, mostly taps, optional steps skippable, a clean review card, name capture, then it *actually generates a real plan*. This is the best 90 seconds of the product. Two dents: the login screen before it is a bare form with zero pitch (a friend clicking your invite link sees Email/Password, not a reason), and the payoff plan is **"Week 1 of 1"** — onboarding on a Thursday, my one-week plan was 60% elapsed at birth. Three days in, the app's next message is effectively "generate again."

**The wait.** ~30 seconds on a black screen with one static line ("Building your plan… This may take a minute."). On web the Skia bench-press loader doesn't render at all; on device it does, but there's no progress, no per-step narration ("Picking your Tuesday…"), nothing to read about what it's deciding for you. The most magical moment the product has is its emptiest screen. (Also: "Apply to Plan" is visible and gold *during* generation.)

**The session.** Open workout → Start → the active card shows "Last time (Jul 23): 5×145 lb…" and "Next: 145 lb × 6 (add a rep)" in gold. This is the app at its best — and then I found the crack: **the reps stepper prefills the plan minimum (4), not the suggestion (6)**. The big gold button — which the whole UX trains you to mash — logged 5×4@145 for me: *below* my last session, while the line above told me to add a rep. The fast path contradicts the coach. (Weight prefills from the suggestion; reps don't.)

Between sets: nothing. No countdown, no rest guidance (the plan literally prescribed "2m30s rest" — it's shown in preview and never again), no elapsed clock, and on a phone the screen would lock. Exercise transitions require an extra "Start Incline Barbell Bench Press" tap — fine. The ⋯ menu offers How-to / Notes / Add Set / **Add RPE (confirmed dead — tapping it renders nothing)** / Skip for today. Skip is well-executed (strikethrough, badge, "Include again", header recount) — but it's the *only* answer to a taken machine, and it means lost volume, not swapped volume.

**Finish.** "Workout Complete!" — static text, three tiles, total volume, and two *correct* PR highlights ("T-Bar Row 5×105 lb · up from 100 lb"). The data layer nailed it. The presentation is a receipt: no motion, no haptic, no streak mention ("4-week streak alive" was true and unsaid), no share, and the workout isn't even saved yet — a "Save Workout" button gates the moment (and the code flips "Saved ✓" *before* the network call: `WorkoutSession.tsx:2071-2077`).

**Afterward.** Progress: accurate (4-week streak, 14 sessions, 145,130 lb) and *thin* — one streak card, three tiles, one bar chart, half the screen empty. History: calendar with per-day badges and a faithful set-by-set day view (no PR markers, no edit/delete, hardcoded "lb"). Exercise detail: the new history section works, but the e1RM "chart" is four near-identical gold blocks — a 158→169 lb trend is visually invisible (min-max + 40% floor + wide bars). Plan tab: rest days render as "**Add workout for Wednesday**" (recovery reframed as a gap to fill), and "Clear week" (red, destructive) outranks the day list. Profile: functional settings list; the dark-mode switch is iOS-green in a gold app; sign-out lives only in Home's avatar menu.

---

## 3. Weakest areas, ranked (with the evidence that matters)

### 3.1 The rest-time void (highest at-the-gym impact, lowest effort to fix)
- No rest timer anywhere; `restSeconds` flows through the API and renders in preview (`PlanPreviewScreen.tsx:1588`), the session discards it. Vestigial timer model in `types/workout.ts:79-90` (`restTimerSeconds`, `isResting`…) used by nobody.
- No `expo-keep-awake` dependency → screen locks mid-workout, every rest ends in FaceID.
- No visible elapsed clock (`Elapsed` renders only when ETA is null, which never happens: `WorkoutSession.tsx:377-381`) — yet a per-second ticker re-renders the whole session for a number shown only at the finish.
- Haptics library exists (`lib/haptics.ts`) and is spent on onboarding; set completion gets the generic button tick, the finish moment gets nothing.

### 3.2 The frozen plan (highest product-identity impact)
- All adaptation is preview-only; after Apply the toolkit is move/shift/delete/clear/manual-add + a buried whole-workout regen 3 taps deep that drops equipment/injury/goal/experience constraints (known safety issue, `docs/future.md`).
- Unused backend capability: `POST /plans/generate-single-session`, `getPlanById`, `updatePlan` — zero frontend call sites. The mid-plan features are half-built already.
- Missed week → the calendar marches on, no acknowledgment. Only-30-minutes-today → nothing. Injury mid-plan → nothing. Deload on demand → nothing. "Extend plan" → promised in copy (`GeneratePlanScreen.tsx:1253`, `HomeScreen.tsx:644`), **does not exist** (grep: copy only).
- Plan end = gray banner + "Generate a fresh block" into the same blank wizard with zero carry-over of what you lifted. A finished block — the app's biggest earned moment — celebrates nothing.
- One plan forever: creating/accepting deactivates the old plan and strands it (no list/switch/rename/delete UI or route).

### 3.3 The retention vacuum
- **Notifications: absent at every layer** (no `expo-notifications` in `package.json`, no backend push/cron/email — verified by dependency read + greps). Day-3 streak danger, "leg day in 2h", weekly recap: all impossible today.
- Streak is computed and displayed only on Progress (Plan stack, 2 navigations deep); Home shows week dots but no streak number.
- PRs are never persisted as events — no records screen, no "PR on Jul 12" anywhere after the finish screen dismisses.
- Rep PRs and e1RM PRs don't exist — only heavier-weight PRs count (`sessionAchievements.ts:202`); on double-progression (most hypertrophy training) *most real progress is invisible*.
- Share is a cul-de-sac: `jimapp://` scheme-only QR (no https fallback), redeem requires an existing account, sender never sees redemptions. It cannot acquire users.

### 3.4 The rigid day (no escape hatches)
- No quick-log / empty workout: WorkoutScreen's no-plan state points at the Plan tab (`WorkoutScreen.tsx:96`); a session cannot exist without a plan/saved workout.
- No custom exercises (no model, no UI — schema has only id-reference tables). Both this and quick-log are already acknowledged in `docs/future.md` — this audit confirms they're the two biggest "life happens" gaps.
- No mid-session swap; the "No library page" alert literally instructs the user to do manually what the feature should do (`WorkoutSession.tsx:779-786`), while the backend replace endpoint (same-muscle, pattern-deduped) is called from exactly one place: plan preview.
- Search → action is severed: finding "cable row" ends at an info page unless you entered search from a session's add-mode (which itself is blocked until the workout is saved).

### 3.5 Exercise knowledge outsourced
- Teaching content = avg 4 short steps (291 of 1,299 exercises share one of 69 copy-pasted instruction sets), **collapsed by default**, plus a "Watch demo on YouTube" button that runs a YouTube *search* — ads, Shorts, and an exit from the app. The `youtubeId` pipeline is fully plumbed frontend+backend and connected to nothing (1 video mapped, never rendered).
- No form cues, no mistakes, no media, and no "how much should I start with?" despite the app owning goal/experience and a full e1RM engine.
- Catalog fields that could power filters (difficulty, position, unilateral, compound/isolation) are populated on all 1,299 rows and never surfaced or filterable.

### 3.6 Progress that can't answer "am I getting stronger?"
- No volume trend, no strength trend across exercises, no per-muscle weekly set split, no duration trend, no body-weight presence on Progress (it's an island under Profile), no goal weight.
- Per-week `totalSets`/`volumeLb` are computed and never rendered (`progressStats.ts:156-165`) — the richer screen is half-built server-side.
- Charts are hand-rolled flex bars with height floors — fine for session counts, wrong for continuous series (the live e1RM chart reads as a solid strip).
- No edit/delete/annotate on any past log (open decision §6.5) — a typo'd 500 lb curl silently poisons PRs, prefill, and volume *forever*, which undermines the app's hard-won honesty guarantees.

### 3.7 Design & IA (what "feels off" actually is)
The color system is genuinely disciplined (30 semantic tokens, ~11 stray hex in all screens) — but it's the *only* system:
- **Contrast bug on every primary CTA in dark mode**: `onPrimary #F4F1EA` on gold `#C7A46A` = **2.08:1** (fails WCAG even for large text). Home already uses the correct dark-on-gold (8.07:1) — one token fix makes the whole app look intentional. Light mode's `textMuted` (2.53:1 at 11-13px) is the same class of problem.
- No type scale (545 raw `fontSize` literals, 20 distinct values; screen titles are 18/22/26/28 across the five main surfaces), no radius scale (22 distinct values; cards are 12/14/16), five different feedback systems (71 `Alert.alert` + two hand-rolled toasts + two inline-error styles), three back-button styles.
- **Motion budget is spent 100% before login** (aurora, logo, springs, haptics) — WorkoutSession, Home, Progress, and the finish screen have zero animation. Where the dopamine should be, the app is static; where nobody lingers (auth), it dances.
- IA: Profile is reachable *only* via Home → avatar → menu (one hidden door for theme/units/sign-out); Progress and History are stack screens inside the Plan tab; the Plan tab wears a calendar icon while hiding the calendar. Error honesty is inconsistent — two screens render **false empty states from catch blocks** (`WorkoutScreen.tsx:555-559` says "No plan yet" when the server is down; `ExerciseDetailScreen.tsx:337-341` says "Exercise not found").
- Safe-area is broadly handled; the one violation is Home's avatar menu anchored at a magic 76pt (`HomeScreen.tsx:797`) — wrong on every notched iPhone (i.e., every beta tester). My web run reproduced the class of bug: the menu positions against the window, not its anchor.

---

## 4. Table stakes vs Strong / Hevy / Fitbod

| Feature | Strong/Hevy/Fitbod | Jim |
|---|---|---|
| Auto rest timer + notification | All three | **Absent** (data flows, UI discards) |
| Keep screen awake in session | All | **Absent** |
| Superset / circuit grouping | Strong, Hevy | **Absent** (form asks for "circuits", generator ignores it, session can't represent it) |
| Plate calculator | Strong | Absent |
| Warm-up set ramp in session | Fitbod | Text-only, preview-only |
| Quick/empty workout | Strong, Hevy | **Absent** |
| Custom exercises | Strong, Hevy | **Absent** |
| Exercise media (GIF/video/illustration) | All | Absent (external YouTube search) |
| In-session exercise swap | Fitbod | **Absent** (backend ready, no UI) |
| Adaptive progression from logs | Fitbod | Absent (prefill/next-target is the seed of it) |
| Rep/e1RM PRs, records page | Strong, Hevy | Absent (weight-PRs only, shown once) |
| Push reminders / streak nudges | All | **Absent** |
| Apple Health / Watch | Strong, Hevy | Absent |
| Post-workout share card | Hevy (social feed) | Absent |
| Plan pause / reschedule | Fitbod (freshness), others partial | Absent |
| Editable routine (sets/reps/rest) | Strong, Hevy | Absent post-apply |
| Body measurements / photos | Strong, Hevy | Absent |
| **Last-time + next-target inline** | partial | **Present — ahead of Strong here** |
| **Honest PR claims (no confetti spam)** | Hevy over-celebrates | **Present — a real differentiator in trust** |
| **Plan transparency ("what drove this")** | none | **Present — unique** |

---

## 5. What would actually make people want to use it

Ranked bets, each tagged with cost. The theme: **make the AI a coach you talk to during the week, not a generator you used once** — that's the differentiator nobody at this table has (Fitbod adapts silently; nobody *converses*), and the backend is already paid for.

### Bet 1 — Own the rest period (S, days)
Auto-start a rest countdown on set completion using the prescription's `restSeconds` (visible ring + big numbers + haptic at 0 + local notification if backgrounded), `useKeepAwake()` while a session is active, elapsed clock in the header, success haptic on set-complete and finish. This alone moves the app from "logbook" to "companion." It's also the cheapest item on this list.

### Bet 2 — The post-workout coach note (S, days — one Groq call)
At finish, send the session vs. plan vs. history to the LLM for a 2-3 sentence note: *"Bench stalled at 4s across five sets — we'll hold 145 Thursday and push the last set to 6. T-Bar PR two weeks running; rows are your engine right now."* Render it on the finish screen and pin it to Home until the next session. Suddenly the AI is present **every single workout**, the finish screen has a voice, and Home has a reason to be opened on rest days. This is the single highest leverage-per-token feature available and no competitor at this price point does it.

### Bet 3 — Unfreeze the plan: three escape hatches (M, 1-2 weeks)
Wire the UI to endpoints that already exist:
1. **"Swap" in the session ⋯ menu** → the catalog replace endpoint (same muscle, pattern-deduped) — answers "machine taken" in two taps.
2. **"Short on time?" on today's card** → drop/trim accessories to fit 30 min (deterministic, no LLM needed).
3. **"Regenerate this day"** on Plan slots → the unused `generate-single-session` endpoint (fixing its known constraint-dropping first — it's a safety issue for injuries).
Plus the one-line fix with outsized coaching integrity: **prefill reps from the next-target suggestion**, so the mash path follows the coach instead of undercutting it.

### Bet 4 — Make the streak visible and the phone capable of speaking (M)
Streak flame + number in Home's header (data already fetched); `expo-notifications` with exactly three messages: workout-day reminder at the user's usual hour, streak-about-to-break on the week's last possible day, and a Sunday recap ("3 sessions, 12,400 lb, 2 PRs"). Habit apps live and die here; Jim currently cannot speak at all.

### Bet 5 — A finish screen worth screenshotting (M)
Count-up animation on the tiles, the coach note (Bet 2), streak line, and a **share-card image** (dark-gold card: session name, volume, PRs, streak) via the native share sheet. For a friends-and-family beta on iMessage, this is the only realistic viral loop — the current QR share can't acquire users (auth-gated, scheme-only) and redemptions are invisible to the sender.

### Bet 6 — Answer "how do I do this?" in-app (M, content problem)
The `youtubeId` pipeline exists end-to-end with 1 mapping. Curate ~150 embedded videos for the exercises that actually appear in generated plans (generation logs tell you exactly which), show a thumbnail on detail, keep instructions *expanded* on first visit, and add "Similar exercises" (replace endpoint, read-only). A beginner can then trust the plan without leaving the app.

### Later, worth keeping on the wall
Plan-end celebration with block-over-block lifts (data exists); records/PR-history screen (persist achievements at save time); rep- and e1RM-PRs; sets-per-muscle weekly split (the body-map assets are *begging* to be a heat-map progress view — a genuinely ownable visual no competitor has); quick-log + custom exercises (already in `future.md`); server-side preferences (reinstall currently wipes identity and forces re-onboarding — also already known); Apple Watch/HealthKit (big, post-beta).

---

## 6. Bugs & integrity issues found by this audit (not previously recorded)

**Live-verified in the running app:**
1. **Next-target reps aren't prefilled** — suggestion says "×6", stepper starts at plan-min 4; the primary button logs below the coach's target (see §2).
2. **"+ Add RPE" is dead** — `showAdvancedLogging` is toggled, persisted in drafts, and never read by the card (`WorkoutSession.tsx:1747-1754` vs `:1158`). Confirmed live: sheet closes, nothing changes.
3. **Onboarding auto-plan is 1 week** ("Week 1 of 1"), mostly elapsed if you sign up late in the week — the payoff plan expires almost immediately.
4. **e1RM trend chart is illegible by construction** (min-max + 40% floor + full-width bars renders an 11 lb spread as identical blocks).

**From agent passes (spot-checked, with lines):**
5. **kg users' inline stepper steps in pounds** — raw delta added to canonical-lb weight; "+5" moves 20.0 kg → 22.3 kg (`WorkoutSession.tsx:477-495`); the edit sheet converts correctly, the stepper doesn't.
6. **Timed weighted sets inflate volume** — seconds×weight lands in `volumeLb` (a 45s @ 70 lb carry books 3,150 lb) feeding finish screen + saved log (`sessionAchievements.ts:141-149`).
7. **Resumed drafts inflate duration** — `totalTime = end − draft.startTime`; resume yesterday's draft → a 14-hour workout in history (`WorkoutScreen.tsx:617`, `WorkoutSession.tsx:716`).
8. **"Saved ✓" renders before the POST starts**; on failure the user was already told it saved (draft survives as silent mitigation) (`WorkoutSession.tsx:2071-2077` → `WorkoutScreen.tsx:641-662`).
9. **Preview "Swap Workout" creates a permanently dead slot** (no exercises, Start dead-ends) that survives Apply (`PlanPreviewScreen.tsx:908-957`).
10. **Preview move-to-occupied-day desyncs UI from draft** — applied plan gets a doubled day + a lost session (`PlanPreviewScreen.tsx:754-789` vs `:962-985`).
11. **Cross-account draft leak** — workout draft key is device-global, not per-user, and isn't cleared on sign-out (`workoutDraftStorage.ts:4`, `AuthContext.tsx:173-186`).
12. **Bodyweight-only onboarding silently dumps into the manual form** — equipment map drops Bodyweight/TRX/Medicine Ball/Battle Rope, readiness fails, "Get my plan" breaks its promise (`GeneratePlanScreen.tsx:334-352`, `:1006-1009`; flagged in the June review, still open).
13. **False empty states from catch blocks** — server down reads as "No plan yet" (`WorkoutScreen.tsx:555-559`) and "Exercise not found" (`ExerciseDetailScreen.tsx:337-341`).
14. **History day detail hardcodes lb and renders timed sets as reps** (`CalendarScreen.tsx:39,44`) — the exact class of bug just fixed on ExerciseDetail, still live one screen over.
15. **Delete-account alert leaks server config** ("…until the server is configured with SUPABASE_SERVICE_ROLE_KEY…") verbatim to users (`ProfileScreen.tsx:525-529`).
16. **"Extend the plan after you apply it" is promised in two places and doesn't exist** (`GeneratePlanScreen.tsx:1253-1255`, `HomeScreen.tsx:644`).
17. Add-from-search hardcodes `3×10` even for time-based exercises (`SearchScreen.tsx:869-871`, `:961-963`).
18. Legal URLs fall back to `example.com` unless env vars are set in the build (`constants/legalUrls.ts:6-13`).
19. Calendar month fetch failure has no retry and renders a falsely empty grid (`CalendarScreen.tsx:180-186`).
20. Dark-mode CTA contrast 2.08:1 on every shared-Button primary action (`Button.tsx:56` + `colors.onPrimary`) — one token edit.

**Pre-existing / already tracked elsewhere (not re-argued here):** UTC month-window (handoff §2), workout-deletion semantics (§6.5), regen constraint-dropping, server-side prefs, 401 refresh race, generation-quality watch list. Live generation notes for that watch list: my Upper·A drew 4 chest presses vs 1 row; Upper·B drew flat+incline+decline barbell bench in one session; Lower·B ordered Back Squat (2×5) behind 45° Leg Press (5×4) — the press-redundancy / pull-ratio / ordering items all manifested in one real generation.

---

## 7. If I were sequencing the next month

1. **Week 1 — "It feels like a gym app now":** rest timer + keep-awake + haptics + elapsed clock (Bet 1), reps-prefill fix (Bet 3.4), CTA contrast token fix (§3.7). All small, all compounding.
2. **Week 2 — "The AI is alive":** post-workout coach note (Bet 2) + streak on Home + notifications skeleton with the three messages (Bet 4).
3. **Week 3 — "The plan bends":** in-session Swap + "short on time" + single-day regen with constraints fixed (Bet 3).
4. **Week 4 — "It spreads":** finish-screen glow-up + share card (Bet 5); start the video curation drip (Bet 6).

That order front-loads daily-use feel, then gives the app a voice, then removes the churn triggers, then adds the growth surface — and every step is visible to your iPhone beta testers the day it ships OTA.

---

*Full agent evidence (file:line for every claim) is preserved in the six reports from this session; this doc is the synthesis. The audit ran against the uncommitted working tree — the three known Progress bugs (timed rows, e1RM undercut, retry empty-state) are confirmed fixed in it and are not listed above.*
