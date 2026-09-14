# Onboarding review — September 2026

**Created:** 2026-09-09
**Scope:** the first-run flow as it is in the code today, what comparable gym apps
add and why, whether generating a plan at the end is the right ending, where a
"skip" belongs, and a look at the `emilkowalski/skills` repository a friend sent.
**Status:** findings and recommendations only. Nothing here is implemented.
**Sibling:** [`ONBOARDING_WELCOME_REVIEW.md`](./ONBOARDING_WELCOME_REVIEW.md) (June)
covered the auth hand-off and the generator DTO. This doc is about the questions,
the ending, and what to add or drop. Where the two disagree, this one was checked
against the code on the date above.

---

## 0. What the flow is today (checked against `OnboardingScreen.tsx`)

| Screen | What it asks | Required? | Feeds what |
|--------|-------------|-----------|------------|
| Welcome | "Let's build your plan", three feature rows, "Takes about a minute" | — | — |
| 1 Goal | One main goal, optional second focus (two-tap picker) | Yes | Template recommender, AI generator |
| 2 Experience | Beginner / intermediate / advanced | Yes | Recommender tie-break, generator intensity |
| 3 Frequency | Days per week (default 4), flexible or pick the weekdays | Yes | Recommender (day range), generator |
| 4 Equipment | Multi-select with Gym / Home presets | Yes (≥1) | Generator filter |
| 5 Work-arounds | Injury tags + free text; subtitle says "Optional — most people skip this" | No | Generator avoid-list |
| 6 Weight | Number + lb/kg; "Skip if you'd rather not" | No | First weigh-in (Profile weight card) |
| 7 Review | Summary rows + optional first name | No | Crew / Profile display name |
| Payoff | "Here's your program": recommended coach-built template → **View program**; **Build a custom plan with AI**; **I'll explore the app first** | — | — |

Nine screens, seven of them questions, four of those required. Answers are persisted
and onboarding is marked complete on entry to the payoff, so every exit is a plain
navigation.

**Two corrections to earlier notes.** The June doc and this morning's worklog both say
onboarding ends by auto-generating a plan. It does not, and has not since the payoff
screen landed: nothing in the app navigates to the generator with `autoGenerate`
any more. The `weeks: 1` default in `GeneratePlanScreen` only bites the **"Build a
custom plan with AI"** exit, which drops the user on the full form. The **recommended
template** is an 8-week program.

**Two things the flow does not do**, which matter below: sign-up comes *before*
onboarding (the auth stack gates everything), and the app asks for no notification
permission and syncs no Health data (no `expo-notifications`, no HealthKit package).

**One friction found on the way.** "View program" opens `TemplateDetailScreen`,
which seeds its day count and weekdays from the **template's defaults**
(`setDaysCount(detail.daysPerWeek)`, `setWeekdays(detail.defaultWeekdays)`), not from
the answers the user just gave on step 3. A user who said "4 days, Mon Wed Fri Sat"
is asked to pick days again, prefilled with someone else's choice.

---

## 1. Why the other apps ask so much more, and what to take from it

### What they add

| What | Who | Why they ask | For Jim |
|------|-----|--------------|---------|
| Body stats: age, sex, height, weight | Noom, calorie apps, Fitbod (weight) | Calorie / TDEE maths; "projection" screens ("you'll reach X by date"); strength standards by bodyweight class | Jim does no nutrition. Weight is already optional. Age and sex would only earn a place if the Profile's best-lift bands used bodyweight-and-sex standards, which they don't today. **Don't add.** |
| Motivation: "why are you here?" | Duolingo ("Why are you learning?"), Fitbod ("main reason for joining", asked first, before any stats) | A commitment device (people who state a reason stick more), copy personalisation, segmentation | One screen, four options. The evidence is real but mostly Duolingo's own; treat it as **worth testing**, not a must. If added, put it first and reflect it in the payoff copy. |
| Session length | Fitbod (workout duration), nearly every generator | The plan's most concrete constraint after days per week | Jim asks it on the AI form (30–60 min) and the templates carry a minutes range, but **onboarding never asks**. This is the one missing input that changes the output. **Add**, as a second control on the frequency step. |
| Current activity level | Jim's own AI form has it | Sets starting volume | Minor; the experience question covers most of it. Leave. |
| Notification permission, primed in context | Fitbod: "On the days you exercise, do you want a preview of your workout?" | A yes on a contextual ask beats the bare system dialog; a no is cheap to retry later | No push yet (needs a binary). When it lands, ask **after the first plan is applied**, never inside the questions. |
| Apple Health / wearable sync | Fitbod, Peloton | Steps, HR, recovery | Nothing in Jim consumes it. **Skip** until something does. |
| "How did you hear about us?" | Almost every subscription app since iOS 14.5 | Ad attribution died with ATT; self-reported source is the cheapest replacement. Best completion (45–85%) right after a meaningful action | Beta testers are known people; pointless now. **At public launch**, one tap, skippable, after the first plan is applied. |
| Paywall / trial | All of them | Money | Not applicable yet. Keep the placement evidence for later: apps that let people sample first see 1.5–2× the trial-to-paid rate of hard paywalls; the recommended point is after 2–4 completed workouts. |
| Social proof, "people like you", projections between questions | Noom (113 screens, ~15 min, and people finish it) | "Every question should deliver something back": acknowledgement, a fact, a recalculated projection | The technique transfers even to a short flow: a one-line payoff after a step ("84 exercises match your setup" after equipment; "3 programs fit 4 days" after frequency). **Cheap, worth doing.** |

### Why the length

Three forces, none of them about the plan:

1. **The investment effect.** Each answered question is sunk cost before the paywall.
   Lose It! reported trial starts rising "double digits" as they kept making onboarding
   longer; Me+ runs 45–50 screens. RevenueCat's own headline is that health and
   fitness onboarding "might be too short".
2. **Personalisation uplift.** Flows that branch on two or three intent questions report
   roughly 8% more trial starts and 17% more paying conversions than generic ones.
3. **Attribution and permissions.** The HDYHAU question and the primed notification ask
   exist because the platform took the tracking away.

And the counter-evidence, which is where Jim already sits: the benchmark clusters put
top-decile subscription apps at **3–5 questions and 90–180 seconds** from open to
paywall, each screen past that costs completions, and skippable flows complete about a
quarter more often than mandatory ones. Apple's guidance is blunter still (section 3).

**Verdict.** Don't build a quiz funnel. Jim is at the long end of "short" already
(seven question screens). Add the one input that changes the plan (session length),
consider the one that changes commitment (motivation), give something back after
each step, and move what the plan doesn't need out of the way (section 3).

---

## 2. Generate at the end, or let them explore?

### What the evidence says

- **Apple, HIG "Onboarding":** "Postpone nonessential setup flows or customization
  steps." "Provide reasonable default settings so most people can immediately start
  interacting with your app." "Teach through interactivity." The older "First Launch
  Experience" page: "Get to the action quickly." "Avoid asking for setup information
  up front. People expect apps to just work."
- **Activation.** Across fitness apps the most predictive signal for day-30 retention
  is completing a real first action on day one, and for a workout app that action is
  a finished workout. Users with fewer than three sessions in the first two weeks
  churn at three to four times the rate of those who form a weekly habit.
- **AI-first apps generate immediately.** Fitbod asks four things (goal, experience,
  equipment, recovery state) and then builds the first session on the spot: sets,
  reps, weights, a rest timer, swap any exercise. That build *is* the aha moment.
  Note what it builds: **one workout**, in seconds, not a multi-week plan.
- **Explore-first apps delay the gate.** Duolingo lets people do a lesson before
  registering (the "soft wall"); its former CPO calls it one of the most powerful
  ideas they had, at the cost of some lost emails.

### What that means for Jim

The current ending is already the right shape: a payoff screen with **an instant
recommendation** and two other exits, no forced wait. Keep it. Fix what is around it:

1. **Make the recommended program one tap and use the answers.** "View program"
   should not re-ask days and weekdays (section 0). Seed `TemplateDetail` from the
   preferences, or better, put **"Start this program"** on the payoff card itself with
   the start date set so the **first session is today** when today is a training day.
   That turns the payoff into the activation moment instead of a second form.
2. **Show the payoff's first workout.** The card says "Upper Body Focus · 8 weeks ·
   3–5 days". It should also list the first session's exercises. That is the
   "something back" for seven answers, and it is what Fitbod shows.
3. **The AI exit should not land on the 40-field form.** The user just answered the
   form's questions. That exit should generate straight from the answers with a
   progress screen and an "edit details" escape, i.e. bring back auto-generate for
   **that exit only**, and default it to more than one week (four is the obvious
   number; a product call). Today the exit shows the form with `weeks: 1`.
4. **Do not add a mandatory "building your plan" wait.** Generation takes up to
   150 seconds when Groq is slow. If someone picks the AI exit, they should be able to
   leave the progress screen and come back; the preview is already persisted for
   48 hours (`planPreviewDraftStorage`), so that is mostly a navigation change.
5. **"I'll explore the app first" stays.** It lands on Home's "No plan yet" card, whose
   "Generate my plan" button now opens the generator directly (fixed this week).

**Answer to the question as asked:** no, the user should not be put into an automatic
task with no way out, and today they are not. The failure is milder: the fastest
exit re-asks a question, and the AI exit turns a payoff into homework.

---

## 3. Skip

**Rule from the evidence:** a question is required only if the plan is wrong without
it. Everything else is skippable, labelled as such, and ideally asked later, in the
place where the answer is used.

| Step | Today | Recommendation |
|------|-------|----------------|
| Goal, experience, frequency, equipment | Required | Keep required: each changes the recommendation or the generated plan. Presets keep equipment to one tap. Consider "Not sure" on experience, mapped to beginner with a line saying the plan adjusts. |
| Work-arounds | Optional in the subtitle; the button still says "Continue" | Keep in onboarding (injuries change exercise selection), but make the button read **Skip** when nothing is entered. Same pattern Wise and Revolut use: label optional steps explicitly. |
| Weight | Optional; "Skip if you'd rather not" | **Move it out.** It feeds the Profile weight card, not the plan. Ask it the first time the user opens the weight tracker, where the value is used. Onboarding drops to six question screens and "Takes about a minute" becomes true. |
| Name (review step) | Optional | Keep; it is where the review lives anyway. Could move to the crew join flow, which is the only place the name is seen by someone else. |
| Age, sex, height, HDYHAU, notifications, Health | Not asked | If any are ever added: **after** the payoff, one tap, skippable, in context. Never in the question run. |

The June doc retracted "onboarding has no skip" as by-design. That still holds for the
flow as a whole: a new user with no plan has nothing to explore, so a whole-flow skip
buys little. Per-step skipping is different and is what Apple's guidance points at.

---

## 4. The `emilkowalski/skills` repository

**What it is.** Emil Kowalski is a design engineer (formerly Vercel and Linear, maker
of the Sonner toast and Vaul drawer libraries, and of the paid course animations.dev).
The repo is twelve AI-agent "skills": plain-markdown `SKILL.md` files with YAML
frontmatter, the same format as this repo's `.claude/skills/verify/SKILL.md`. MIT,
about 36k stars. Installed with `npx skills@latest add emilkowalski/skills` (a Vercel
Labs CLI that targets Claude Code, Cursor, Codex and others) or by copying a folder.

**Is it "Apple's design and flow of apps that give them success"?** No. Ten of the
twelve skills are web animation craft (easing, durations, springs, CSS, Framer Motion),
one is Swift, one is his toast library's docs. Only `apple-design` mentions Apple, and by
its own description it is "distilled from their WWDC design talks and translated for the
web": how motion should feel, plus Apple's eight "Principles of Great Design". Nothing in
it is about app flows, product structure, onboarding, or why apps succeed. The README is
also partly a funnel for the course and a newsletter.

**What in it is still useful here.** From `apple-design`, section 16 — the principles —
reads like a checklist for an onboarding step: "Purpose. Make with intention; decide
what not to build. Every feature asks for the user's time, attention, and trust";
"Agency. Keep people in control: offer choices, don't force a single path"; "Privacy:
ask at the right moment, only for what's needed, transparently"; "Simplicity — not
minimalism… Show the common path first, advanced options one level deeper";
"Wayfinding. Every screen should answer: Where am I? Where can I go? What's there? How
do I get out? Never trap the user"; "Direct, specific labels beat safe generic ones."
Those say the same thing as sections 1–3 of this doc, from a different direction.

From `animate-expo`, the one React Native skill, three concrete findings against
`OnboardingScreen.tsx` as it is:

1. The review-step checkmark uses `ZoomIn.duration(180)`, which starts at scale 0. The
   skill's rule: "Never scale(0). Start from scale(0.9–0.97) + opacity: 0." Fix:
   `ZoomIn.withInitialValues({ transform: [{ scale: 0.9 }] })` plus a fade.
2. No `useReducedMotion` anywhere in the file. "Reduced motion ships with the animation,
   not as a follow-up": keep the opacity changes, drop the translation.
3. Steps enter with `FadeInDown` whether the user goes forward or back. The Apple
   principle is "Enter and exit along the same path"; going back should mirror.

Everything else is already within the skill's bounds (step transition 260 ms, progress
bar 300 ms; the welcome "Rise" at 420 ms is over the 300 ms guideline but is a one-time
screen). Its recommended values, for reference: press feedback 100–150 ms at scale
0.97; chips and toggles 150–200 ms; sheets a spring of about 300 ms; ease-out on entry,
never ease-in; `Easing.bezier(0.23, 1, 0.32, 1)` instead of the built-ins; stagger
30–80 ms; a spring whenever a finger was involved; one haptic per user action.

**Recommendation.** Install two skills, copied rather than symlinked (Windows), into
`.claude/skills/`: `animate-expo` (with its `RECIPES.md`) and `review-animations` (with
`STANDARDS.md`; it only runs when invoked as `/review-animations`, a useful gate before
merging onboarding motion, though its standards file is CSS-flavoured). Skip
`apple-design` beyond reading section 16 once, `emil-design-eng` (CSS and Framer Motion,
prints a course plug), and `animation-vocabulary` (a glossary).

```
npx skills@latest add emilkowalski/skills -s animate-expo -s review-animations -a claude-code --copy
```

License is MIT; keep the copyright notice with the copied folders. Nothing from it ships
in the app binary, so no in-app attribution.

---

## 5. Recommended changes, in order

Small first, each shippable alone. **S** under an hour, **M** half a day, **P** a
product decision before code.

1. **S — Seed `TemplateDetail` from the onboarding answers** (days, weekdays). Removes
   the re-ask on the fastest exit.
2. **S — "Skip" on the optional steps**, and move the weight step to the weight
   tracker's first open.
3. **S/M — Session length on the frequency step**, passed to the recommender
   (`sessionMinutes`) and the AI request.
4. **M — Payoff card shows the first session and applies in one tap**, start date
   today when today is a training day.
5. **M/P — The AI exit generates from the answers** with a progress screen and an
   "edit details" escape; default length above one week (**P**: pick the number).
6. **S/M — One-line payoff after each step** ("84 exercises match your setup").
7. **P — Motivation question as step one.** Test it; don't assume it.
8. **P, at public launch — HDYHAU and the notification prime**, both after the first
   plan is applied, both skippable. And the pre-auth welcome / delayed sign-up from
   the June doc, which is the same "value before the gate" idea Duolingo proved.

Not recommended: body stats, Health sync, a longer quiz, anything that makes the
question run longer than it is.

---

## 6. The in-depth asks, one by one

Dylan's follow-up: the big gym apps go much deeper (a ruler for height, a scale for
weight, "your local gym" with its machines, Apple Health, and more). Why, and is there
an advantage worth having?

**The test applied to each ask** is three questions. Does anything in Jim consume the
answer today, or could it with work we'd actually do? Would the person see the
difference in their plan or their profile? What does it cost: a screen, a dataset to
maintain, a native module, an App Review question?

**The pattern behind all of them.** In every app that asks these, the answer feeds
something the user is then shown: a calorie target, a BMI, a projected date, a
starting weight on the bar, a rank. And most of those apps put a paywall at the end,
so each answered question is also sunk cost. Jim has no paywall and computes none of
those things from body data today, so the same questions in Jim would be friction
with nothing behind them. Where Jim *could* compute something worth seeing, the
answer is to build that thing and ask for the data at the moment it pays off.

| Ask | Why they ask | What Jim would do with it | Verdict |
|-----|--------------|---------------------------|---------|
| **Height** (ruler picker) | BMI and calorie maths in nutrition products (Noom, MyFitnessPal, Cal AI). Fitbod uses height with weight to scale bodyweight-exercise targets. The ruler itself is a small tactile moment that makes a quiz feel like an instrument. | Nothing. No nutrition, no BMI, no bodyweight-scaled volume model. The generator's inputs are goal, experience, days, minutes, equipment, limitations. | **No.** Even strength standards, if you ever show them, use bodyweight and sex, not height. |
| **Weight** (scale picker) | Calorie maths; Fitbod infers a starting weight for a lift you've never done by matching you against "an enormous pool of lifters with similar strength profiles" (87M logged workouts); relative strength standards; a weight-trend chart people come back to. | Two real consumers: the Profile weight card (a trend to return to) and, with sex, a strength level per lift on the Athlete card. Not the plan. | **Yes, in context.** Keep it optional and ask it where it is used: the first time the weight tracker opens, and the first time the best-lift card has a lift to rank. The scale-style picker is a fine control for the weigh-in sheet; it is a control, not a reason to ask earlier. Out of onboarding (section 3). |
| **Sex** (and age) | Strength standards are sex-specific tiers by bodyweight; age shifts them and sets heart-rate zones; both feed calorie maths. | Today nothing: best lifts are shown as absolute e1RM. With bodyweight + sex, Jim could rank each lift (Novice / Intermediate / Advanced) from the history it already keeps. | **Yes, later, in context.** Liftoff's entire model is a rank, at $500K a month: "You cannot close an app and also remain the person you described yourself as inside it." Jim's honest version is a level on the Athlete card that moves as you log. Offer "See your level — add bodyweight and sex" when the first lift lands, with "prefer not to say". Not in onboarding, where there is no lift to rank and so nothing to give back. Age: only if levels use it; otherwise no. |
| **Current maxes** ("what's your bench?") | Seeds starting loads and projections. | Generated plans ship no weights; loads come from logged history. "What do I put on the bar?" is a new user's biggest unanswered question in session one. | **Not as a question.** Beginners can't answer it and Fitbod's answer is the right one: start conservative and learn from the log. Better: a first-set helper inside the session ("Start light — we'll learn from this set"), and an optional "I know my max" entry on that exercise. |
| **Your local gym** (its machines) | Precision: the 12-chip list cannot say "leg press yes, hack squat no", and a wrong machine means a swap mid-session. Alpha Progression has per-location gym profiles. No mainstream app I could verify picks equipment from a gym *directory*; Planet Fitness's own app knows its machines because it owns them (a QR code on every one). A chain's inventory differs per location and changes, so a directory is a data-maintenance product in itself. | The catalog **already carries machine-level ids** (chest press, pec deck, leg press, hack squat, pendulum squat, leg curl, calf raise, back extension, roughly forty) but `EQUIPMENT_MAP` folds every one into the single label "Machine", and gating compares labels. The data exists; the gate does not. | **Not a directory.** Two cheaper steps get most of the value: (1) presets by *context* on the equipment step — Commercial gym · Apartment or hotel gym · Home · Bodyweight only — which is what "select your gym" mostly buys; (2) later, a "machines at my gym" checklist under Profile → Equipment fed by the catalog's own ids, gated by id, plus per-location profiles (home vs gym) once people have two setups. That is the same screen the equipment-image work is waiting on. |
| **Apple Health** | Three different things. (a) *Write* workouts: they appear in the Fitness app and count toward the Move ring, so your app shows up in a place people open daily, with your name on the entry. (b) *Read* weight, height, age, sex: skip the questions. (c) *Read* heart rate, steps, sleep: recovery models. Plus an Apple Watch companion in the big ones. | (a) is one call per finished session; Jim already has start, end and duration. (b) maps one-to-one onto the weight tracker. (c) has no consumer until there is a recovery model. Nothing is wired today; there is no HealthKit module in the app. | **Yes, as a feature, not a question.** Write workouts first, prime it once after the first completed session ("Add this to Apple Health?"), the way Fitbod primes notifications. Read body mass second. Skip heart rate and sleep. Cost: a config plugin and usage strings (Jim already ships EAS dev builds, not Expo Go), an App Review privacy answer, iOS only (all testers are on iPhone; Android would need Health Connect). Module: `react-native-health` is the established one; the Expo-native ones are young (`@kayzmann/expo-healthkit` 2.0, `EvanBacon/apple-health` at 38 stars). Pick after a one-day spike; none is Expo-official. |
| **Target weight and a dated projection** | Reward before behaviour; a concrete date to work toward; the engine of quiz funnels (Noom recalculates the date every twenty-odd screens). | A training app's honest projection is strength, not weight, and promising "add 20 kg to your squat by November" is a promise the plan can't guarantee. | **No.** The payoff screen's first session is the concrete promise. The Progress screen's e1RM chart is the honest projection, after the fact. |
| **Preferred exercises** | Liftoff asks it (the mascot "shows excitement"); the generator gets a bias list. | The AI request already takes `preferredExercises`, and the app already has hearted exercises. | **Feed the hearts in.** No question needed: saved exercises become the bias list automatically. |
| **Activity level, split preference, cardio modality** | More generator inputs. | All three exist on the AI form; onboarding skips them. | **Leave on the form.** Split and modality are advanced-user knobs; activity level is mostly covered by experience. |
| **Notifications, referral, rating** | Liftoff asks all three inside onboarding, notifications "framed as habit mechanism". | Covered in sections 1 and 3. | After the first plan (notifications), after a personal best (rating), never inside the question run. |
| **Body fat %, waist, progress photos** | Physique and nutrition products. | No consumer. | **No.** |

**So what does "in depth" actually buy them?** Three things Jim does not have and mostly
should not want: calorie maths, a paywall that sunk cost pays for, and a starting-load
model trained on tens of millions of other people's workouts. The two pieces worth
taking are the ones with a visible payoff Jim can build from what it already stores: a
**strength level** (bodyweight + sex, asked when the first lift exists) and **workouts in
Apple Health** (asked after the first finished session). Both are features with their
own moment, and neither belongs in the question run.

---

## 7. The harsh walkthrough

Dylan's three questions: is it the best now (not too much, not too little); does "Other
notes" on the work-arounds step do anything; and should there be a loading moment after
Finish like other apps have. Answered by walking the flow as a stranger would, with the
code open, and being unkind.

### Is it the best now?

No flow is "the best" until it is measured, but the **shape** is right: six questions,
each required or visibly skippable, a real payoff, three exits, nothing that feeds
nothing. That is the not-too-much / not-too-little line. What stands between the shape
and a flow I'd defend is the list below. Three of them are not polish; they are the
app promising something it does not do.

### What the walkthrough found

| # | What a real user hits | Severity | Fix |
|---|------------------------|----------|-----|
| 1 | ~~**"Build a custom plan with AI" is not AI right now.**~~ **RESOLVED 2026-09-14.** `GROQ_MODEL` named `llama-3.3-70b-versatile`, retired by Groq on 2026-08-16, so every generation fell to the rule-based builder. The model is now env (`LLM_PROVIDER` / `LLM_MODEL`, default Gemini 3.5 Flash-Lite) behind `src/llm/llm-client.ts`, live in production since that day. | High | Done: swap plus a daily model-exists check that pages via Sentry (`docs/llm-model-swap.md`). **Still open from this row:** the preview never tells the user when a plan came from the rule-based builder — the flag exists server-side and is worth surfacing, since the fallback still fires on a provider outage. |
| 2 | **The work-arounds step is ignored by the main exit.** Injury tags become `avoidConstraints`, and `filterExercisesByAvoidList` applies them on the generated and rule-based paths. Nothing in `templatePlan.ts`, `TemplateDetailScreen` or `TemplatesScreen` reads them: the recommended program, the exit most people take, gets a plan with the exercises the user just said hurt. | High | Either run the template's exercises through the same avoid filter and swap flagged ones (the replace-suggestions endpoint already exists), or say on the step exactly when the answer is used. Asking for quasi-medical information and discarding it on the default path is the worst version. |
| 3 | **"Other notes" does nothing for anyone today.** The free text becomes `restrictions`, which is only ever a line in the Groq prompt ("User restrictions (respect these…)"). Templates never see it, the rule-based builder never sees it, and the prompt goes to a dead model. Even alive, a prompt hint is a request the model may ignore. | High | Remove the free text from onboarding. Keep the tags. If the AI exit's prompt comes back to life, the field belongs in Profile under the AI plan settings, with copy that says it is a hint to the generator. |
| 4 | **Removing the weight step removes the only place the unit is set.** `setWeightUnit` runs in onboarding only when a weight is typed, otherwise in Profile; the default is pounds. A metric user gets lb on every screen until they find the toggle. | Medium | Infer the unit from the device region (US, Liberia and Myanmar use pounds; everyone else kg) and let the weigh-in sheet show it as a one-tap toggle. |
| 5 | **"Start today" can be a lie.** `suggestedTemplateStartDateISO` starts this week only when today is on or before the earliest chosen weekday; otherwise the plan starts next Monday. With flexible days the template's default weekdays apply. A Tuesday sign-up can be told to wait six days: the dead first week the calendar notes already record. | Medium | The payoff card names the real first day ("First session · Thursday"), and apply puts the first session on the next chosen day, never a Monday for its own sake. |
| 6 | **Two of the five goals have no home.** `goalBucket` maps Strength and Build muscle to strength, Fat loss to fat loss, and General fitness, Endurance and "nothing" to balanced. A runner who taps Endurance is recommended a Push/Pull/Legs hybrid. | Medium | Either drop Endurance from the list (Jim is a lifting app; own it) or label the payoff honestly ("Closest program to your goal"). Don't promise a match the catalog can't make. |
| 7 | **Twice a week is not an option.** Frequency offers 3–6; four of the five templates support 2 days. | Low | Add 2. The row control has room. |
| 8 | **The two-goal picker is a hidden mode.** First tap sets the main goal, the second tap adds a "2nd focus". A user who taps a second card to *change* their mind gets two goals and a badge they didn't ask for. The helper line explains it, below the fold on small phones. | Low | Single select, plus an explicit "Add a second focus" link that reveals the second pick. Test it before shipping either way. |
| 9 | **"We'll adjust as you log" is not true yet.** The proposed "Not sure" card promises adaptation; the app suggests next targets per exercise but never re-derives experience. | Low | Say what is true: "We'll start you easy. You can change this in Profile." |
| 10 | **Half the "something back" lines are copy, not facts.** The schedule and equipment lines can be computed (programs that fit, exercises that match). The goal and experience lines are sentences anyone could write. Apple's rule: structure and ornament must encode something true. | Low | Keep the computed ones. Make the other two factual about the plan ("Strength: 3–6 reps, long rests") or drop them. |
| 11 | **The front door is still a login form.** A stranger's first screen is "Log in"; the welcome with the value proposition is behind sign-up. Irrelevant for beta testers who know you; the biggest leak at public launch. | Launch | The June doc's pre-auth welcome, or Duolingo's soft wall (see section 2). |
| 12 | **"Takes about a minute" was optimistic.** Nine screens, seven with questions, realistically 60–120 s. | Low | With weight out and explicit skips it is close to true; keep the promise only if it is. |

Things checked that hold up: the progress bar and step counter; Back from step 1 returns
to the welcome; presets keep equipment to a tap; the review step lets a slip be fixed
before commitment; onboarding is marked complete on entering the payoff, so a killed app
lands on Home with a clear "No plan yet" card rather than back in the questions; every
answer is editable in Profile; the template list failing to load degrades to a
"Browse programs" card instead of blocking; the 280-character caps match on both ends.

### The loading moment

Other apps show a "Building your plan…" screen after the last question, usually fake
and usually 3–8 seconds. The reason it works is documented: Buell and Norton's
"labor illusion" (Management Science, 2011) found that when a service visibly shows the
work it is doing, people value the result more and will even prefer a slower result to an
instant identical one. The mechanism is perceived effort and reciprocity.

Two versions for Jim, and only one of them is the screen already drawn:

- **The AI exit** is the "Building your first week" artboard: real work (a generation
  that can take 10–150 s), real stages, an escape hatch. It must be driven by events,
  with a minimum display of about 1.2 s so the rule-based builder's instant answer does
  not flash it.
- **The recommended-program exit** has no wait today; the template is chosen the moment
  the review step opens. Add a short, *honest* matching moment before the payoff card:
  1.5–2.5 s, three lines that are true and computed ("Checked 5 programs", "2 fit 4 days
  × 45 min", "Picked Strength · Upper/Lower"), a tap skips it. Not a spinner, not eight
  seconds, nothing invented. Operational transparency, not theatre.

### Ordered, with the earlier list folded in

1. Model swap or honest copy for the AI exit, and a visible note when a plan is
   rule-based (#1).
2. Injury tags honoured on the template path, or the step says when they apply (#2).
3. Drop "Other notes" from onboarding (#3).
4. Seed the program screen from the answers, and name the real first day (#5, and
   section 5's item 1).
5. Skip on optional steps; weight out; unit inferred from region (#4).
6. Session length on the schedule step; add 2 days (#7).
7. Payoff card shows the first session; one-tap start; the honest matching moment.
8. Goals: drop Endurance or label the match honestly (#6).
9. Factual "something back" lines only (#10); truthful "Not sure" copy (#9).
10. The goal picker mode (#8), tested.
11. At launch: the pre-auth welcome (#11).

Then measure: completion per step, and the share of new accounts with a finished
workout on day one. Those two numbers decide what "best" means from here.

---

## Sources

Numbers from vendor blogs (RevenueCat, Adapty, RocketShip, Business of Apps, Digia,
Lifecycle Architect) are directional, not peer-reviewed. Apple's text is quoted from
the HIG.

- Apple, Human Interface Guidelines, Onboarding —
  https://developer.apple.com/design/human-interface-guidelines/onboarding
- Apple, iOS HIG (older), First Launch Experience — mirrored at
  https://codershigh.github.io/guidelines/ios/human-interface-guidelines/interaction/first-launch-experience/index.html
- RevenueCat, "Why your onboarding experience might be too short" —
  https://www.revenuecat.com/blog/growth/why-your-onboarding-experience-might-be-too-short
- RevenueCat, "HDYHAU attribution for subscription apps" —
  https://www.revenuecat.com/blog/growth/how-did-you-hear-about-us-surveys
- Fairing, HDYHAU best-practices guide (timing and completion rates) —
  https://fairing.co/resources/guides/hdyhau-attribution-survey-best-practices-guide
- RocketShip HQ, "Most fitness apps gate workouts immediately" (RevenueCat / Adapty /
  data.ai / AppsFlyer figures) — https://www.rocketshiphq.com/paywall-structure-fitness-app-workouts/
- Adapty, Health & Fitness subscription benchmarks —
  https://adapty.io/blog/health-fitness-app-subscription-benchmarks/
- Growth Waves, "The 113-screen onboarding that doesn't feel long" (Noom) —
  https://www.growthwaves.io/p/the-113-screen-onboarding-that-doesnt
- Appcues, Duolingo's onboarding (motivation and daily goal) —
  https://goodux.appcues.com/blog/duolingo-user-onboarding
- Reach Capital, product lessons from Duolingo's former CPO (the soft wall) —
  https://www.reachcapital.com/resources/thought-leadership/product-lessons-from-duolingos-former-chief-product-officer-jorge-mazal/
- App Fuel, Fitbod onboarding flow (20 screens, the primed notification ask) —
  https://www.theappfuel.com/examples/fitbod_onboarding
- Yahoo Health, Fitbod review (questions asked, three free workouts) —
  https://health.yahoo.com/wellness/fitness/online-fitness/articles/fitbod-app-review-good-beginners-193000972.html
- TechRadar, Fitbod (first session built on the spot) —
  https://www.techradar.com/computing/websites-apps/this-app-has-changed-my-workouts-forever-and-could-help-you-finally-crack-the-gym-in-2025
- Lifecycle Architect, activation optimisation for fitness apps —
  https://lifecyclearchitect.com/guides/activation-optimization-for-fitness-apps/
- Airbridge, app activation metric —
  https://www.airbridge.io/en/blog/what-is-an-app-activation-metric
- Digia, app onboarding rate statistics (skippable flows) —
  https://www.digia.tech/post/app-onboarding-rates-statistics/
- Business of Apps, mobile app onboarding guide (personalisation uplift) —
  https://www.businessofapps.com/guide/app-onboarding/
- Emil Kowalski, `skills` — https://github.com/emilkowalski/skills

Section 6:

- Fitbod, "Estimated Strength" and the algorithm Q&A (starting weights inferred from
  similar lifters; body weight and height scale bodyweight-exercise targets) —
  https://fitbod.me/blog/estimated-strength/ and
  https://fitbod.zendesk.com/hc/en-us/articles/16254175592215-Fitbod-s-Algorithm-Q-A
- Strength Level, strength standards by bodyweight, sex and age —
  https://strengthlevel.com/strength-standards
- Barbell Medicine, strength standards by bodyweight, age and sex —
  https://www.barbellmedicine.com/blog/strength-standards/
- Tasu, Liftoff onboarding teardown (42 screens, rank identity, $500K/month) —
  https://tasu.ai/library/liftoff
- Alpha Progression, gym profiles per location —
  https://alphaprogression.com/en/blog/best-gym-apps
- Planet Fitness, app with a QR code on every machine —
  https://www.prnewswire.com/news-releases/planet-fitness-reinforces-commitment-to-judgement-free-fitness-with-evolved-visual-identity-and-enhanced-mobile-app-302873049.html
- Apple Support, "Sync a third-party workout app to Fitness on iPhone" (third-party
  workouts count toward the Move ring) —
  https://support.apple.com/guide/iphone/sync-a-third-party-workout-app-iph392b962da/ios
- Apple Developer, "Workouts and activity rings" —
  https://developer.apple.com/documentation/healthkit/workouts-and-activity-rings
- `react-native-health` — https://github.com/agencyenterprise/react-native-health ;
  `@kayzmann/expo-healthkit` — https://www.npmjs.com/package/@kayzmann/expo-healthkit ;
  `EvanBacon/apple-health` — https://github.com/EvanBacon/apple-health
- ScreensDesign, fitness app onboarding examples (dated weight projections) —
  https://screensdesign.com/articles/fitness-app-onboarding-examples/

Section 7:

- Buell, R. W. and Norton, M. I., "The Labor Illusion: How Operational Transparency
  Increases Perceived Value", Management Science 57(9), 2011 —
  https://pubsonline.informs.org/doi/10.1287/mnsc.1110.1376
