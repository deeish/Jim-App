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
- [ ] Re-tap the "Plan" tab icon while deep in GeneratePlan/PlanPreview/WorkoutDetail → note what actually happens (refocus at current screen vs. reset to PlanList) — this is a known asymmetry vs. Search, not confirmed as a bug; see §14

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
- [ ] Mid-session "Replace exercise" → confirm current behavior: switches to Search tab with no exercise/return context (known dead-end, not expected to "just work" — see §14)
- [ ] Finish or discard a session → cleanly returns to the pre-start view, no visual glitch

## 9. Tab: Search / Exercises

- [ ] Tab tap → SearchList shown
- [ ] **Not** in add-mode: row tap, variation-chip tap, and the ⓘ info button **all three** open ExerciseDetail
- [ ] **In** add-mode (arrived via any "Add exercises" flow): row tap and variation-chip tap **select/deselect** instead of navigating; the ⓘ info button **still opens ExerciseDetail** even in add-mode — confirm this split feels intentional, not like a broken tap target
- [ ] Complete an "add to plan" flow → lands on Plan tab, wherever its stack currently is (not guaranteed to be PlanList)
- [ ] Complete an "add to workout" flow started **from Plan** → lands on Workout tab
- [ ] Complete an "add to workout" flow started **from WorkoutDetail** → also lands on Workout tab
- [ ] Complete an "add to workout" flow started **from a live WorkoutSession** → also lands on Workout tab (all three land the same place regardless of origin — confirmed intentional-but-asymmetric vs. add-to-plan, see §14)
- [ ] "Cancel" on the add-mode banner → clears add-mode, stays on SearchList
- [ ] With ExerciseDetail open, re-tap the "Exercises" tab icon → resets to SearchList **without** switching which tab is focused
- [ ] **(Android)** hardware-back at the stack root while the "saved" filter is active → switches filter to "all" first, doesn't leave the tab on that same press
- [ ] **(Android)** hardware-back again once "all" is already active → doesn't unexpectedly bubble out and exit the tab

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
- [ ] Profile → "Privacy policy" → opens in system browser. **Confirm it's a real hosted policy page, not `example.com`** — the URL falls back to a placeholder if `EXPO_PUBLIC_PRIVACY_POLICY_URL` isn't set for this build
- [ ] Profile → "Terms of service" → same check, same placeholder risk
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

## 14. Known asymmetries — confirm still true, then decide (not pass/fail bugs)

These are real, already-confirmed behaviors, not open questions — the
decision needed is whether to leave them as-is or fix them, not whether
they're happening.

- [ ] `WorkoutSession` "Replace exercise" is a dead-end tab switch with no context — leave as a future feature, or wire it up properly, or hide the button until it's real?
- [ ] Plan's "Add exercises" (context menu) doesn't pop back afterward, while WorkoutDetail's equivalent does — harmless today since Plan is a stack root, but worth matching for consistency?
- [ ] "Add to workout" always lands on the Workout tab regardless of where it started; "Add to plan" always lands on Plan — intentional, but confirm it still matches what users expect
- [ ] Plan tab has no re-tap-to-root behavior, unlike Search's tab icon — intentional (Plan holds more "in-progress" screens where losing your place is worse) or an oversight?
- [ ] `SavedWorkoutsScreen`'s standalone fallback and `PlanList`'s `openSaved` param are both dead/unreachable by any current UI — leave alone unless you're building the feature they were meant for (a deep link or notification straight to "your saved workouts"?)

---

**Scope note**: this checklist covers every route documented in
`docs/navigation-route-map.md` §§1-6 as of pass 5 (2026-07-22). If the
navigator tree changes (new screen, new tab, new modal), update the map
first, then add the corresponding item here.
