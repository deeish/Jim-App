# Onboarding & Welcome — Review and Ideas

**Created:** 2026-06-01
**Scope:** The full first-run / welcome experience — auth screens, the 6-step
onboarding, the "Get my plan" auto-generate hand-off, and the backend
generate-sessions surface it depends on.
**Status:** findings only — nothing here is implemented yet. Severity/effort are
estimates to help prioritize.

> Sibling doc: [`ONBOARDING_PREFERENCES_ISSUES.md`](../ONBOARDING_PREFERENCES_ISSUES.md)
> (root) covers the per-user preference-storage issues found 2026-05-28 (mostly
> fixed). This doc is about the **welcome experience and flow**, not storage.

## How the flow works today (context)

1. Logged-out launch → `AuthStack` → **Login** is the first screen (`App.tsx:126`).
2. **Signup** → `supabase.auth.signUp` with no `emailRedirectTo`
   (`AuthContext.tsx:148`) → "check your email" notice. With Supabase email
   confirmation ON, no session is created yet.
3. User confirms in a browser (lands on the Supabase **Site URL**, not the app)
   → returns → logs in → session exists.
4. New account → `hasCompletedOnboarding` false → routes to **Onboarding**
   (`App.tsx:114`).
5. Onboarding: welcome screen → 6 steps (goal, experience, frequency/days,
   equipment, restrictions, review+name) → **"Get my plan"**.
6. `handleNext` writes prefs, calls `completeOnboarding()`, and navigates to
   `GeneratePlan` with `autoGenerate`/`fromOnboarding` (`OnboardingScreen.tsx:180`).
7. `GeneratePlanScreen` seeds from prefs and `replace`s to `PlanPreview`, which
   runs the generation pipeline and (on **Apply**) calls `createPlan`, then drops
   the user on Home.

## Verdict

The onboarding screen itself is the strongest-built part of the app (progress,
haptics, presets, a review step, and — crucially — it ends on a *real generated
plan*). The weakness is everything **around** it: the best screen is shown last,
behind the weakest one (a bare login form + an email hand-off that leaves the
app). The polish is locked behind the friction.

## Re-review (2026-06-01) — corrections after checking the code

The first pass over-stated several items. After verifying against the code:

- **#1 was wrong** (not High — basically a non-issue). The claimed "dead-end with
  no plan and no re-prompt" doesn't happen: `resolveHomeToday` returns `no_plan`
  (`homeToday.ts:70`) and **Home already renders a "No plan yet → Generate my
  plan" CTA** (`HomeScreen.tsx:559–583`). The fix I proposed already exists.
- **#4a was largely wrong.** Home users do **not** get a gym/barbell plan — the
  selected equipment is sent as `equipmentTags` and the backend gym path filters
  candidates to exactly those tags (`plans.service.ts:1537–1547`). The real,
  narrow issue is unmapped equipment labels (see #4).
- **#7 is retracted** — forced first-run onboarding is by design.
- **#5 and #6 hold up.** #2/#3 are valid but are **product/config decisions, not
  defects**, and #3 is conditional on a Supabase setting that was never verified.

Net: only **#5, #4 (the mapping part), and #6** are concrete code changes worth
making, all small. The rest are decisions or already handled. Severity ratings in
the table and sections below are the **corrected** ones.

---

## Summary

| # | Idea / problem | Impact | Effort | Verdict after re-check |
|---|----------------|--------|--------|------------------------|
| 1 | `completeOnboarding()` before a plan exists | Low | — | Non-issue — Home already shows a "Generate my plan" CTA. No action. |
| 2 | Front door is a login form, not a value prop | Med (product) | M–L | Valid opinion, not a defect. Your call. |
| 3 | Email-confirmation hand-off leaves the app | High *if* confirmation is ON | S (setting) | Conditional — verify the Supabase setting first. |
| 4 | Onboarding drops unmapped equipment labels | Low–Med | S | Real but narrow: 4 of 12 labels unmapped. ("Gym plan" claim was wrong.) |
| 5 | `sessions` array uncapped in the DTO | Low–Med (cost) | S | Real, cheap hardening. Worth doing. |
| 6 | Signup missing Login keyboard/autofill polish | Low | S | Trivial, optional. |
| 7 | Onboarding has no skip / exit | — | — | By design — retracted. |

Impact = effect on a new user's experience or on risk. Effort: **S** ≈ <1h,
**M** ≈ half-day, **L** ≈ multi-day / needs a decision.

---

## 1. `completeOnboarding()` fires before a plan exists — Impact: LOW (re-checked) · No action recommended

**Re-check verdict: this is mostly a non-issue.** The first pass claimed a
"dead-end … no plan and no re-prompt." That's wrong. `resolveHomeToday` returns
`no_plan` when there's no plan (`homeToday.ts:70`), and `HomeScreen` already
renders a full empty state for it — a "No plan yet" hero with a **"Generate my
plan"** primary CTA plus a "Build manually instead" link
(`HomeScreen.tsx:559–583`). So a user who fails or abandons generation lands on a
clear one-tap recovery, not a dead-end. The safety net I "recommended" already
ships.

**Residual (minor, defensible).** `completeOnboarding()` (`OnboardingScreen.tsx:180`)
sets the flag before the plan is applied, so an abandoner sees "No plan yet"
instead of being re-shown onboarding. That's arguably the *better* behavior —
re-running the whole 6-step flow would annoy more than a one-tap CTA. Only revisit
if you specifically want abandoners back in onboarding; otherwise leave it.

**Files (for reference).** `frontend/src/screens/OnboardingScreen.tsx:180`,
`frontend/src/lib/homeToday.ts:70`, `frontend/src/screens/HomeScreen.tsx:559`.

---

## 2. Front door is a login form, not a value prop — Impact: HIGH (conversion) · Effort: M–L

**Problem.** A new user who's never heard of "Jim" opens the app to `<AuthStack/>`
→ "Log in" (`App.tsx:126`). The actual pitch — the onboarding welcome with
*"Matched to your goal / Fits your schedule / Uses your equipment"* — is gated
behind signup + email confirm + login. The best selling screen is seen last.

**Best solution.** A lightweight **pre-auth welcome** (value prop + "Get started" →
Signup, "I have an account" → Login). It does *not* need to be the full animated
onboarding; even a value-prop band above the login form would help. This is the
Welcome screen previously planned and deferred — worth reconsidering before
launch.

**Impact if fixed.** Higher signup conversion; the polish users feel matches the
polish that exists. The single biggest "is this the best *welcome*?" lever.

**Files.** `frontend/App.tsx:34` (`AuthStack`), new
`frontend/src/screens/WelcomeScreen.tsx`, reuse `JimLogo` + `Aurora`.

---

## 3. Email-confirmation hand-off leaves the app — Impact: HIGH (first impression) · Effort: S (it's a setting/decision)

**Problem.** `AuthContext.signUp` passes no `emailRedirectTo` (`AuthContext.tsx:148`),
so the confirmation link lands on the Supabase **Site URL** (the `localhost:3000`
seen during testing), not back in the app. Today's flow: signup → "check your
email" → leave app → confirm in a browser → manually return → log in → *then*
onboarding. That's the biggest drop-off in the funnel, and it's before the good
part. Note the inconsistency: password **reset** is deep-linked
(`AuthContext.tsx:157`) but signup confirmation is not.

**Best solution (pick one).**
- **(Simplest)** Turn email confirmation **off** in Supabase → `signUp` returns a
  session → flow collapses to **signup → onboarding** with nothing in between.
  Trade-off: unverified emails (acceptable for many consumer apps pre-launch).
- **(Keep verification)** Switch to **email OTP** (6-digit code entered in-app) —
  no app exit, verification preserved.
- **(Keep links)** Add `emailRedirectTo` with the `jimapp://` deep link so confirm
  returns to the app — but this needs the dev build to test reliably and is the
  most fragile of the three.

**Impact if fixed.** Removes the weakest, earliest step in the funnel.

**Files.** `frontend/src/contexts/AuthContext.tsx:148`, Supabase dashboard (Auth →
providers/email), `frontend/src/screens/SignupScreen.tsx`.

---

## 4. Onboarding drops unmapped equipment labels — Impact: LOW–MEDIUM (re-checked) · Effort: S

**Re-check correction.** The original "home users still get a *gym-location* plan
with barbell exercises" claim was **largely wrong**. On the auto-generate path the
seed sends the user's selected equipment as `equipmentTags`, and the backend gym
path filters candidates to exactly those tags (`plans.service.ts:1537–1547`) — so
the generated exercises *are* constrained to what the user said they have,
regardless of the `gym` label. The location label is a near-cosmetic inconsistency
here, not a wrong-equipment bug.

**The real (narrow) issue — unmapped equipment.** `PREF_EQUIPMENT_MAP`
(`GeneratePlanScreen.tsx:327`) only maps **8 of the 12** `EQUIPMENT_OPTIONS`.
**Bodyweight, TRX, Medicine Ball, and Battle Rope are silently dropped.**
Consequences:
- Selecting *only* from those four → empty `equipmentTags` → the auto-generate
  readiness check fails → `autoFallback` drops the user into the manual form
  mid-hand-off. (Narrow: the built-in "Home" preset includes Dumbbell / Pull-up
  Bar / Resistance Band, so the presets are safe — this needs a deliberately
  minimal manual pick.)
- Any selection mixing those four with mapped items loses them as allowed
  equipment (e.g. a user's "Bodyweight" intent never reaches the generator).

**Best solution.** Add the four missing entries to `PREF_EQUIPMENT_MAP`. Deriving
`primaryLocation` from equipment is optional polish, not required for correctness.

**Impact if fixed.** Bodyweight/TRX/etc. selections actually reach the generator,
and the auto-generate path stops falling back to the manual form for minimal kits.

**Files.** `frontend/src/screens/GeneratePlanScreen.tsx:327` (`PREF_EQUIPMENT_MAP`).

> Verified OK and **not** an issue: injury **notes** → `restrictions` and injury
> **tags** → `avoidList` are both wired correctly, and the 280-char cap matches on
> both ends (`UserPreferencesContext.tsx:81` ↔ `generate-sessions.dto.ts:74`).

---

## 5. `sessions` array uncapped in the DTO — Impact: LOW–MEDIUM (cost; authed + throttled) · Effort: S

**Re-check: confirmed real, severity calibrated.** Verified there's no length
guard — `partitionSessionsForBatching` (`plans.service.ts:674`) just groups by
week, and the DTO has no cap. But exploiting it requires a **registered,
authenticated** account and is bounded by the per-user throttle (120 req/day), so
it's defense-in-depth against cost amplification, not a critical vuln. The fix is
cheap enough to be worth it regardless.

**Problem.** `generate-sessions.dto.ts:149` — every other field is bounded
(`restrictions` 280, `equipmentTags` 12×32, `preferredExercises` 8×40, …) except
the one that actually drives the LLM. The service passes it straight into chunked
Groq calls (`plans.service.ts:1549`) with no length guard. The per-user throttler
caps *requests* (120/day) but not *work per request*, so one authed client
bypassing the UI could POST thousands of sessions → unbounded LLM fan-out and cost
amplification. Normal usage is ≤56 (8 weeks × 7 days).

**Best solution.** Add array bounds to the DTO:
```ts
@IsArray()
@ArrayNotEmpty()
@ArrayMaxSize(64)   // 8 weeks × 7 days + slack
@ValidateNested({ each: true })
@Type(() => SessionSpecDto)
sessions: SessionSpecDto[];
```
Optionally add `@Min`/`@Max` on `durationMin`/`durationMax`/`weekIndex` in
`SessionSpecDto` for defense in depth.

**Impact if fixed.** Closes a cost/DoS lever with a 3-line change; no behavior
change for legitimate clients.

**Files.** `backend/src/plans/dto/generate-sessions.dto.ts:149` (and `:37`
`SessionSpecDto` for the numeric bounds).

---

## 6. Signup didn't get the Login keyboard/autofill polish — Impact: LOW · Effort: S

**Problem.** Login now has `textContentType`, `returnKeyType`, `onSubmitEditing`,
and ref-chaining (email → password → submit). `SignupScreen.tsx` still uses plain
inputs — and it's part of the welcome too.

**Best solution.** Mirror the Login treatment on Signup: email
`textContentType="username"` + `returnKeyType="next"` focusing password;
password `textContentType="newPassword"` + `returnKeyType="go"` → `handleSignUp`.

**Impact if fixed.** Small consistency / autofill win on a front-door screen.

**Files.** `frontend/src/screens/SignupScreen.tsx`.

---

## 7. Onboarding has no skip / exit — Verdict: BY DESIGN (retracted)

**Re-check: not worth doing — retracted as an action item.** Forced first-run
onboarding is a deliberate, standard pattern, and it ends on a generated plan.
Listing it was over-cautious. Leave as-is.

---

## Security posture — what's already good (don't regress)

For balance: the security baseline here is above average for an indie app.
- JWT verification is solid — HS256 legacy **and** RS256/ES256 via JWKS, with
  `audience`, `issuer`, expiry, and clock tolerance enforced (`auth.service.ts:50`).
- All `/plans` routes behind `AuthGuard`; AI endpoints additionally throttled
  per-user (burst + daily) (`plans.controller.ts:77`, `app.module.ts:41`).
- `ValidationPipe` with `whitelist + forbidNonWhitelisted + transform`
  (`main.ts:69`); 512kb body cap; Helmet; CORS allowlist.
- Free-text caps on everything reaching the prompt (the one gap is #5).
- GROQ key backend-only; anti-enumeration on auth errors (`authValidation.ts:43`);
  per-user preference keying + sign-out reset; sanitized errors in prod.

---

## Recommended order (after re-check)

Only three concrete code changes survive the re-check, all small and low-risk
(good as separate scoped commits):
1. **#5 DTO `@ArrayMaxSize(64)`** — cheapest real hardening.
2. **#4 Map the 4 missing equipment labels** — stops the silent drop / autoFallback.
3. **#6 Signup keyboard parity** — trivial polish.

Two are decisions, not code:
- **#3 Email confirmation** — verify the Supabase setting; act only if it's ON.
- **#2 Pre-auth welcome** — product call, the bigger "best welcome" question.

Dropped after re-check: **#1** (Home already handles the no-plan state) and
**#7** (by design).
