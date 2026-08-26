# Navigation QA checklist (on-device)

Companion to `docs/navigation-route-map.md` — that file documents what the
code *should* do and why; this file is for confirming what it *actually*
does, on a real device. Section numbers below match the route map's section
numbers, so if an item fails or surprises you, the map section of the same
number has the full reasoning/call-site detail.

**How to use this**: work through in order. Check a box only after
confirming the *expected result* on-device, not just that "something
happened." If a box won't check cleanly, leave it unchecked and add a short
`— FAILED: ...` note on that line rather than deleting/skipping it, so the
list stays an accurate record of what's actually been verified versus not.

Test on **both** platforms where noted — iOS swipe-back, Android hardware
back, and the on-screen back button/chevron are three different code paths
in this app and have historically diverged (that's the entire reason this
map and checklist exist).

---

## 0. Setup

- [ ] Have both an iOS device/simulator and an Android device/emulator available (or at minimum, know which one you're skipping and accept the gap)
- [ ] Have a second test account available, or a way to sign out and back in easily (needed for §12)

## 1. Auth stack (signed out)

- [ ] Login → "Create an account" → Signup screen opens
- [ ] Signup → footer "Sign in" link → back to Login
- [ ] Signup has no on-screen back button by design — confirm hardware-back (Android) / swipe-back (iOS) still pops to Login via history
- [ ] Login → "Forgot password?" → ForgotPassword screen opens
- [ ] ForgotPassword → back button → returns to Login
- [ ] Trigger a real password-reset email → tapping the link opens SetNewPassword directly, pre-empting Login/Signup entirely
- [ ] SetNewPassword → "Sign out" button → drops to Login

## 2. Onboarding (fresh account only)

- [ ] New signup → onboarding flow shown, not the main tabs
- [ ] Complete onboarding → "Get my plan" → lands on GeneratePlan, pre-filled for auto-generate
- [ ] From that auto-generate GeneratePlan screen, back (any trigger) does **not** return to onboarding — onboarding is gone from history for good

## 3. Tab: Home

- [ ] Sign in → lands on Home by default
- [ ] "View history" → Plan tab → History screen; back button returns to PlanList (not a dead end), even if Plan was never separately visited
- [ ] "Progress" shortcut → Plan tab → Progress screen; back returns to PlanList, same as History (added 2026-07-28; verified on Expo web only, so hardware-back and swipe-back are unconfirmed)
- [ ] "View plan" → Plan tab shows PlanList
- [ ] "AI Generate" shortcut → Plan tab → GeneratePlan
- [ ] Generic "go work out" → Workout tab
- [ ] A specific "start today's session" card → Workout tab with that workout preselected
- [ ] Avatar icon (top right) → "Profile menu" opens with three rows: My profile / Log weight / Sign out
- [ ] Menu → "My profile" → Profile screen; back → returns to Home
- [ ] Menu → "Log weight" → LogWeightSheet opens over Home, logs a weigh-in, closes cleanly
- [ ] Menu → "Sign out" → confirm dialog appears → confirming drops you to Login
- [ ] **(iOS only)** confirm both "Log weight" and "Sign out" present their follow-up modal/Alert cleanly *after* the menu finishes dismissing — no dark overlay stuck on screen, no double-modal flash
- [ ] Android hardware-back at Home with no other history → exits the app (does not freeze, crash, or silently no-op)

## 4. Tab: Plan

- [ ] Tap any workout day → a preview sheet opens (does **not** jump straight to WorkoutDetail)
- [ ] Rest day → tapping it opens the rest-day sheet, not the workout-preview sheet
- [ ] Preview sheet's "View details" (only present/enabled once the day is linked) → WorkoutDetail; back → PlanList
- [ ] Long-press a **linked** day → context menu → "View details" → WorkoutDetail directly (skips the sheet)
- [ ] Long-press an **unlinked** day → context menu → "View details" → opens the same preview sheet (does not go straight to WorkoutDetail — there's nothing to view yet)
- [ ] "View history" button → History screen
- [ ] "AI Generate" button → GeneratePlan
- [ ] Linked day → "Start workout" → Workout tab switches, correct workout loads
- [ ] Materialize a workout from an empty slot, then start it → Workout tab loads the new workout
- [ ] Context menu "Add exercises" on a linked day → Search tab opens already in add-to-workout mode
- [ ] "Add exercises" on an unlinked day → Search tab opens in add-to-plan mode instead
- [ ] "Saved workouts" button → modal opens → tap a saved workout → modal closes, WorkoutDetail opens for it
- [ ] "Saved workouts" modal → close without selecting → just closes, stays on PlanList
- [ ] "Share" button → ShareModal opens with a QR code + short code (may take a moment to load) → tap "Share" → native OS share sheet appears → close modal → back on PlanList
- [ ] Re-tap the "Plan" tab icon while on **History** → resets to PlanList (fixed pass 6)
- [ ] Re-tap the "Plan" tab icon while on **Progress** → resets to PlanList (added 2026-07-28; behaves like History on Expo web)
- [ ] Re-tap the "Plan" tab icon while on **WorkoutDetail** → resets to PlanList (fixed pass 6)
- [ ] Re-tap the "Plan" tab icon while on **GeneratePlan** (with unsaved edits) → does **NOT** reset — just refocuses on GeneratePlan, edits still there. This is the important one, and it was **genuinely broken until pass 10** (the form was silently discarded, no prompt): native-stack pops the stack itself on a re-tap unless the press is `preventDefault()`ed, and that pop bypasses the discard guard. Verified fixed on Expo web; re-confirm on device
- [ ] Re-tap the "Plan" tab icon while on **PlanPreview** → does **NOT** reset — just refocuses on PlanPreview, nothing lost
- [ ] **Edge case**: leave Plan while on WorkoutDetail (tap Home, not the Plan icon), then tap the **Plan tab icon directly from Home** → should land on PlanList, not WorkoutDetail. `tabPress` fires on any tab-button press, not just re-taps of the already-active tab — confirm the reset fires on this cross-tab switch too, not only on a literal re-tap

## 5. Plan → GeneratePlan

- [ ] Change something on the form, then back out via **button** → "Discard plan settings?" confirm appears
- [ ] Same, but via **Android hardware back** → same confirm appears
- [ ] Same, but via **iOS swipe-back** → same confirm appears (this is the one most likely to have been missed historically — swipe gestures are the hardest to intercept)
- [ ] "Keep editing" → stays on the form, nothing lost. "Discard" → actually leaves and the edits are gone
- [ ] With **zero edits** made (fresh form), back out → note whether the discard prompt fires anyway (open question in the map — record the real answer here)
- [ ] Submit → lands on PlanPreview
- [ ] From PlanPreview, "Edit" → back on GeneratePlan with the same values pre-filled; going back again doesn't leave a stale Preview underneath

## 6. Plan → PlanPreview

- [ ] Header back (normal entry, not from onboarding) → returns to GeneratePlan
- [ ] Header back (entered via onboarding) → goes to **Home**, not GeneratePlan
- [ ] Apply a plan from onboarding → lands on Home
- [ ] Apply a plan normally → stays on Plan tab at PlanList; confirm you can't then back/swipe into a stale Generate or Preview screen
- [ ] Tap an exercise shown in the preview → ExerciseDetail opens → back → lands on Plan tab **with the same preview card reopened automatically** (not a blank Plan screen)
- [ ] Force-kill the app mid-generation, relaunch → resumes the in-progress draft straight into PlanPreview

## 7. WorkoutDetail

- [ ] Reached from Plan (either gated call site) → header back → PlanList
- [ ] "Add exercises" → Search opens in add-to-workout mode, **and** WorkoutDetail is gone from history immediately (confirm you can't swipe back into it after)
- [ ] Complete that add (select exercises, confirm) → lands on the **Plan** tab, not Workout (fixed pass 6 — previously this always landed on Workout regardless of origin)
- [ ] "Start workout" → Workout tab opens this workout, **and** WorkoutDetail is gone from history immediately
- [ ] Tap an exercise row → ExerciseDetail opens → back → returns to **Plan** tab (not Workout)
- [ ] "Share" button → ShareModal (workout code) → native share sheet → close → back on WorkoutDetail

## 8. Tab: Workout

- [ ] Tab tap with nothing in progress → auto-loads "today's" workout
- [ ] Arrive via Plan's "Start workout" (`fromPlan` set) → a "back to Plan" affordance is visible, and using it returns to Plan's *current* state (not necessarily where you started)
- [ ] Arrive via a plain tab tap or Home's generic "go work out" (no `fromPlan`) → no forced "back to Plan" affordance appears
- [ ] Pre-start exercise list → tap an exercise → ExerciseDetail → back → Workout tab, same list still showing
- [ ] Start a live session → mid-session "Add exercise" → Search opens in add-to-workout mode
- [ ] Mid-session, tap an exercise card (or the "How to & demo" chip) → ExerciseDetail → back → Workout tab **with the live session state intact** (sets/reps you'd already entered are still there)
- [ ] Open the "..." exercise options menu mid-session → confirm **"Swap Exercise" is gone** (removed pass 6, was a dead-end) — menu should read Notes / + Add Set / RPE toggle / Skip for today, nothing between Notes and the divider before + Add Set
- [ ] Finish or discard a session → cleanly returns to the pre-start view, no visual glitch

## 9. Tab: Search / Exercises

- [ ] Tab tap → SearchList shown
- [ ] **Not** in add-mode: row tap, variation-chip tap, and the ⓘ info button **all three** open ExerciseDetail
- [ ] **In** add-mode (arrived via any "Add exercises" flow): row tap and variation-chip tap **select/deselect** instead of navigating; the ⓘ info button **still opens ExerciseDetail** even in add-mode — confirm this split feels intentional, not like a broken tap target
- [ ] Complete an "add to plan" flow → lands on Plan tab, wherever its stack currently is (not guaranteed to be PlanList)
- [ ] Complete an "add to workout" flow started **from Plan's context menu** → lands on the **Plan** tab (fixed pass 6)
- [ ] Complete an "add to workout" flow started **from WorkoutDetail** → also lands on the **Plan** tab (fixed pass 6)
- [ ] Complete an "add to workout" flow started **from WorkoutScreen's pre-start "Add from library"** (before starting the session) → lands on the **Workout** tab, back at the pre-start list
- [ ] Complete an "add to workout" flow started **from a live WorkoutSession**'s "Add from library" → also lands on the **Workout** tab, session state intact — these last two land on Workout because that's genuinely where the request came from; the first two land on Plan because neither was mid-workout
- [ ] "Cancel" on the add-mode banner → clears add-mode, stays on SearchList
- [ ] With ExerciseDetail open, re-tap the "Exercises" tab icon → resets to SearchList **without** switching which tab is focused
- [ ] **(Android)** hardware-back at the stack root while the "saved" filter is active → switches filter to "all" first, doesn't leave the tab on that same press
- [ ] **(Android)** hardware-back again once "all" is already active → doesn't unexpectedly bubble out and exit the tab
- [ ] **Fixed pass 8**: start an "add to workout" (or "add to plan") flow from anywhere, select an exercise or two, then leave Search by tapping a **different tab directly** (not Cancel, not completing the add) → the add-mode banner and selection **should now clear automatically**. Tap back to the Exercises tab → confirm it opens fresh, NOT still in add-mode from the abandoned flow (see §7 #8)
- [ ] **Regression check for the same fix**: start an add-to-workout flow, tap the ⓘ info button on an exercise to view its detail (staying in add-mode, still on the Exercises tab) → back out to SearchList → confirm your selections and the add-mode banner are **still there**, not wiped just from checking a detail page mid-flow
- [ ] Same regression check via the **re-tap-Exercises-icon** path instead of the chevron: from that same ExerciseDetail-mid-add-flow state, re-tap the Exercises tab icon (not a different tab) → resets to SearchList, add-mode and selections still intact. This one was **genuinely broken until pass 10** — the chevron path preserved add-mode but the tab-icon path wiped it, because the reset used a non-merge `NAVIGATE`, which replaces route params. Verified fixed on Expo web; re-confirm on device

## 10. ExerciseDetail cross-tab back-navigation — the critical matrix

This is the section the whole map exists for. For **each** of the six entry
points below, test **all three** back triggers: on-screen chevron, Android
hardware back, iOS swipe-back gesture. That's up to 18 individual checks —
worth doing in full, since a prior regression here specifically hid in one
trigger type while the other two looked fine.

| Entry point | chevron | hardware back | swipe-back | Correct target |
|---|---|---|---|---|
| SearchScreen (row/variation/info tap) | [ ] | [ ] | [ ] | SearchList, same stack |
| PlanScreen (calendar day-detail sheet) | [ ] | [ ] | [ ] | Plan tab |
| PlanPreviewScreen (preview card tap) | [ ] | [ ] | [ ] | Plan tab, same preview card reopens |
| WorkoutDetailScreen (exercise row tap) | [ ] | [ ] | [ ] | Plan tab |
| WorkoutScreen (pre-start list) | [ ] | [ ] | [ ] | Workout tab |
| WorkoutSession (live session card / "How to" chip) | [ ] | [ ] | [ ] | Workout tab, session state intact |

- [ ] For **each** of the five cross-tab entries above: after arriving, re-tap the "Exercises" tab icon instead of backing out → must show SearchList, must **not** bounce to Plan/Workout
- [ ] For **each** of the five cross-tab entries above: after arriving, tap a **different** tab directly → must go to that tab normally, must **not** bounce to Plan/Workout first
- [ ] "Exercise not found" empty state → "Go Back" link behaves identically to the chevron for whichever entry point you arrived from

## 11. Root-level screens

- [ ] Profile → "Weight Tracker" → WeightTracker screen; back → Profile
- [ ] WeightTracker → its own "+"/log button → LogWeightSheet opens (same component Home uses), logs correctly
- [ ] Profile → "Redeem a code" → ShareRedeem screen; back → Profile
- [ ] Profile → back button → returns to whichever tab was active before you opened Profile (not always Home)
- [ ] Profile → "Export my data" → native share sheet appears with a JSON export
- [ ] Profile → About → "Privacy policy" row. There is no placeholder fallback: the row is **absent** unless `EXPO_PUBLIC_PRIVACY_POLICY_URL` is a real https URL in this build's env. If it's present, it must open a real hosted policy page in the system browser. (In a dev build the row shows "Not configured" instead of disappearing.)
- [ ] Profile → About → "Terms of service" → same rule, `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- [ ] Profile → "Feedback & support" → opens the device's mail app, pre-addressed
- [ ] Profile → "Delete account" → double confirm → account deleted → automatically signed out → Login screen

## 12. Share-code deep link

- [ ] From Plan or WorkoutDetail, "Share" → get a code/QR
- [ ] On a second signed-in account: scan the QR (or open the `jimapp://share/CODE` link) → ShareRedeem opens with the code pre-filled
- [ ] Open the same link while **signed out** → confirm it's silently held, not lost or crashed, and resolves once login/onboarding finishes
- [ ] Redeem a **plan** code → lands on Plan tab
- [ ] Redeem a **workout** code → lands on WorkoutDetail for that workout

## 13. Forced/automatic sign-out (harder to trigger — best-effort)

- [ ] If feasible, force a session expiry (e.g. revoke the session server-side, or wait out token expiry) and then trigger any API call → app should silently sign out to Login with no crash, no confirm dialog
- [ ] If mid-workout when this happens, confirm what you'd expect: this path has **no warning and no save-first step** by design — decide if that's acceptable for a live session with unsaved sets (see §14)

## 14. Known asymmetries

Four of the five items originally on this list were addressed in pass 6 —
their verification steps now live inline in the sections above rather than
here (replace-exercise removal: §8; Plan's `goBack()`: withdrawn in pass 9,
see below; add-to-workout landing: §9 and §7; Plan tab re-tap: §4). Listed
here for traceability, plus the one genuinely still-open item:

- ~~`WorkoutSession` "Replace exercise" dead-end~~ — **fixed pass 6**, removed entirely. Verify in §8.
- ~~Plan's "Add exercises" doesn't call `goBack()`~~ — **not a bug; pass 6's "fix" was reverted in pass 9.** A `GO_BACK` from `PlanList` (a stack root) bubbles up instead of no-oping, so the added line logged a dev `console.error` on every press and risked popping the whole tab shell. The asymmetry with WorkoutDetail is correct. If you're running this checklist in a dev build, the one thing to confirm is the *absence* of that error: §4's "Add exercises" items should now produce a clean console.
- ~~"Add to workout" always lands on Workout regardless of origin~~ — **fixed pass 6**, now origin-aware. Verify in §9 and §7.
- ~~Plan tab has no re-tap-to-root~~ — **fixed pass 6**, partially (History/WorkoutDetail only, deliberately not GeneratePlan/PlanPreview). Verify in §4.
- [ ] `SavedWorkoutsScreen`'s standalone fallback and `PlanList`'s `openSaved` param are both dead/unreachable by any current UI — **not touched**, left alone per the map's own recommendation (§3, PlanScreen entry) since deleting or wiring it up wasn't in scope for this pass. Still worth a decision if anyone ever wants to build the deep-link/notification entry point it looks like it was meant for.

---

**Scope note**: this checklist covers every route documented in
`docs/navigation-route-map.md` §§1-6, updated through pass 9 (2026-07-23).
Pass 6 implemented four routing fixes (Plan's `goBack()`, Plan tab
re-tap-to-root, origin-aware add-to-workout landing, replace-exercise
removal); pass 7 re-derived every navigation call site from a fresh grep,
fixed five citation drifts pass 6's own edits had introduced, and found two
edge cases (tab-press-on-any-switch, not just re-tap — needed no fix, just
more accurate docs; stale add-mode params with no cleanup-on-blur); pass 8
confirmed both affect mobile identically to web and fixed the second one
(§7 #8); pass 9 re-reviewed all five pass-6 code changes against the React
Navigation source and reverted the `goBack()` one (see §14) — the other four
held up; pass 10 ran the whole app locally (backend + Expo web + a faked
session) and drove every route with Playwright, which found **two real bugs
nine passes of code review had missed** — GeneratePlan's discard guard being
bypassed on a Plan-tab re-tap, and add-mode being wiped by an Exercises-tab
re-tap (both fixed, both flagged inline above). If the navigator tree changes
(new screen, new tab, new modal), update the map first, then add the
corresponding item here.

**Lesson worth keeping**: the two bugs pass 10 found were both invisible to
code review because the responsible code lives in `node_modules`, not
`frontend/src` — no grep of this repo would ever surface it. Prefer driving
the running app over another read-through when verifying navigation.
