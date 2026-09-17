# AI plan generation: deep dive (2026-09-16)

**Scope.** The whole "Generate a Plan" feature: the form, what it sends, what the backend does with it, what the model actually decides, what comes back, how the preview shows it, and what happens after Apply. Sources: the frontend and backend code on `main` at `f14fb73`, a real generation run on the local rig with the production Gemini key (intermediate, strength, 4 days, 30 to 45 min, upper/lower), the 2026-09-14 eval captures, the existing docs (`backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md` from March, `PLAN_GENERATION_FLOW_AND_ISSUES.md`, `docs/future.md`, the July and September reviews), and a research pass on program-design evidence and on how Fitbod, JuggernautAI, RP Hypertrophy, Hevy Trainer, Alpha Progression, Dr. Muscle, Freeletics, Future and Boostcamp shape the same feature. Sources are listed at the end.

**Who this is for.** Dylan, deciding what to rebuild before this feature is opened to more people.

---

## 1. Verdict in one paragraph

The pipeline is solid engineering wrapped around a thin programming model. It is reliable, cheap (about one cent and ten seconds per plan), well guarded against the classic LLM failures (hallucinated exercises, duplicates, lower-body lifts on upper days, hype copy), and it has a real eval harness. But the thing a coach is paid for, the prescription, is not designed by anyone: the model only chooses which exercises appear in week one and writes the copy; sets, reps and rest are stamped on afterwards by fixed bands and a time cap; weeks two onward are copies of week one with a multiplier; no load, no effort target, no per-muscle volume accounting, and none of the user's history or body weight is used. The form collects around twenty settings, and about seven of them change nothing; the preview's own "not in the AI request" list is the app admitting it. The result reads like a program at a glance and falls apart when you count sets. The fix is not a better model or a longer prompt. It is a coaching layer that owns volume, effort and load, and a UI that asks for less and shows more.

---

## 2. How it actually works today

What the user sees as "the AI built my plan" is four things in sequence.

1. **The client decides the skeleton.** The form output becomes `PlanInputs`; `planPipeline.ts` turns that into one session spec per training day per week (type, a title such as "Upper 1", a duration window, a hard-day flag, injuries to avoid), plus a canned "meso hint" sentence and a per-week progression table (intensity percent, volume multiplier, rep modifier) that is computed on the phone from the progression style. The backend never chooses the split, the day order or the hard days.

2. **The model designs week one only.** `POST /plans/generate-sessions` chunks the request by week. For the first week, if detail is "detailed", one Gemini call receives a 40-exercise candidate table (anchors first, the rest shuffled), a system prompt with sound structural rules (compounds first, no sub-muscle stacking, one horizontal plus one vertical press, one squat plus one hinge, vary the lead lift when a focus repeats), one line per day, and the goal, difficulty, equipment and limitations. It returns day names, reasoning, warm-up, cool-down and exercise ids with sets and reps. Beginners also get a note per exercise. If the user picked "simple" detail, a rule-based selector builds the week first and the model is only called if that week fails its quality gate.

3. **Rules overwrite most of what came back.** In `session-enrichment.ts`, sets and reps are discarded and re-stamped from role bands (primary compound, secondary compound, isolation, core) crossed with goal and difficulty, snapped to eleven fixed rep bands; total working sets are then cut to a cap set by session length and experience (14, 18 or 22); rest is stamped from the goal scheme; missing movement patterns are inserted with the note "Added so your week trains every fundamental movement pattern."; the reasoning text is rebuilt from the final list; cardio days are replaced wholesale by a template. A validator runs, retries the model once on failure, and then accepts whatever it has.

4. **Weeks two onward are clones.** When every later-week session title matches a week-one title and the week has a progression entry, which is always the case for requests built by the app, `tryCloneFirstWeekSessions` copies week one exercise for exercise and applies the progression table: sets times the multiplier, reps plus the modifier, a deload sentence appended on deload weeks. The intensity percent is prompt text only; nothing consumes it.

Then Apply writes slots. After that the plan is frozen: nothing reads the logged sessions back into it. The two endpoints that do read history (the single-workout preview and "regenerate") sit outside the plan flow, and "regenerate" drops equipment, injuries, goal and experience on the way (`docs/future.md`, lines 282 to 311).

The March assessment in `backend/docs/LLM_GENERATION_HONEST_ASSESSMENT.md` already named several of these gaps (rest never shown, weights empty, slots not enforced). Rest and slot discipline were since fixed. The bigger ones were not.

---

## 3. What we collect, what we send, what we use

| Input | Collected where | Sent to generation | Changes the output | Notes |
|---|---|---|---|---|
| Goal, secondary goal | Form step 1, profile | Yes | Yes: rep bands, rest, cardio finisher | Secondary goal is prompt text plus the finisher switch; never changes the scheme |
| Training days, weeks, start date | Step 1 | Days as specs; weeks as week indexes; start date no | Days yes; weeks yes; start date only client-side | Default is **1 week** |
| Session length | Step 2 | Yes | Yes: exercise count and the working-set cap | The strongest lever in the whole system |
| Experience | Step 2, profile | Yes | Yes: bands, set cap, beginner notes | Not used to gate exercise skill (an advanced lift can open a beginner's day) |
| Location and equipment | Step 2 | Gym: tags. Home: **the checklist is dropped**, server uses a fixed dumbbell/band/bodyweight list | Filters candidates on required equipment | A home user with a barbell rack gets no barbell |
| Injuries and avoid list | Step 2, profile | Yes | Prompt text plus a name regex after the fact | The catalog's joint-demand tags exist and are not used by generation |
| Plan style, split, focus, emphasis | Step 2 | Style and split shape the week skeleton on the phone (day types, titles); none of the four is a field on the request | Style and split: yes, via the skeleton. Focus and emphasis: **no** | Two controls with no effect |
| Progression style | Step 2 | As the progression table | Yes, weeks 2+ | Build, build+deload, maintain |
| Detail level | Step 2 | Yes | Yes: "simple" normally skips the model (a rule-built week that passes its quality gate is used as is; it falls through to the model only if that gate fails) | Not explained to the user |
| Age, cardio equipment (home), per-day time limits, duration by workout type, custom split hint | Step 2 | **Not sent** (duration-by-type is edited but its enabling flag is never set; the split hint has no control) | No | The preview's "not in the AI request" list also names workout formats, two-a-day rules, activity level and preferred lifts, but those are not collected anywhere in the UI today |
| Body weight | Weight tracker | No | No | |
| Logged workouts, best sets, e1RM | Calendar logs | **No** for plan generation | No | Only the single-workout preview path reads them |
| Saved exercises, saved workouts | Exercises tab | No | No | |
| Previous plans | Database | No | No | "Recency" is within one request only |

The honest summary: the plan is a function of goal, days, minutes, experience, gym equipment and injuries. Everything else is either decoration or a promise the form makes and the backend does not keep.

---

## 4. A real week, and what a coach would say

Rig run, production model, defaults plus "intermediate, strength, upper/lower, 4 days, 30 to 45 min". Ten seconds, two calls, about 6,500 tokens.

| Day | Session as generated |
|---|---|
| Mon, Upper · Bench + Row | Bench 5×4-6 (150 s) · Bent-over row 2×5-8 (120 s) · Overhead press 2×5-8 · Face pull 2×5-8 · Wide-grip pulldown 2×12-15 ("Added so your week trains every fundamental movement pattern.") |
| Tue, Lower · Squat + Deadlift | Back squat 5×4-6 · Conventional deadlift 2×5-8 · Romanian deadlift 2×5-8 · Hanging leg raise 2×12-15 · Back extension 2×5-8 |
| Thu, Upper · Press + Pull-Up | Dumbbell bench 5×4-6 · Single-arm row 2×5-8 · Seated DB press 2×5-8 · Push-up 2×5-8 · Side plank 2×40 s (120 s rest) |
| Fri, Lower · Trap + Hip | Dumbbell RDL 5×4-6 · Hip thrust 2×5-8 · Goblet squat 2×5-8 · Power clean 2×5-8 · Front plank 2×40 s (120 s rest) |

What is right: compounds lead, each day has a push and a pull or a squat and a hinge, the lead lift changes angle on the repeat day, nothing is off-equipment, names are plain, the warm-up names the first lift, and the "why" copy is specific.

What a coach would flag, in order of how much it matters:

- **Every accessory is two sets.** Twelve of the sixteen movements are 2×5-8. That is the time cap (about 13 working sets for a 30 to 45 minute window) divided across a five-exercise breadth target. A coach in 40 minutes does three or four movements at three or four sets, not five movements at two. Two heavy sets of rows a week is below the minimum effective dose for an intermediate's back by any published landmark (see section 8).
- **Per-muscle weekly volume is unbalanced and uncounted.** Chest gets about 12 sets, quads 7, hamstrings and glutes around 15 (deadlift, RDL, back extension, DB RDL, hip thrust, clean), horizontal pulling 4. Nobody added it up because nothing in the pipeline adds it up.
- **Tuesday stacks three hinges** (deadlift, RDL, back extension) after a squat. The system prompt forbids three of one sub-muscle, but hinge is a pattern, not a sub-muscle, and the validator only looks for duplicates and focus purity.
- **Rest is one number per goal.** 120 seconds after a face pull, a push-up and a 40-second plank. Rest should follow the movement's role (2 to 3 minutes on the heavy compound, 60 to 90 seconds on isolation and core).
- **Titles lie after repairs.** "Press + Pull-Up" has no pull-up; "Trap + Hip" has no trap-bar lift (it was swapped for a dumbbell RDL). The name is written by the model before the rules edit the list.
- **A power clean at 2×5-8 as the fourth exercise of a lower day** for a self-described intermediate is a skill and fatigue mismatch. Experience is never used to gate exercise skill.
- **No weight anywhere and no effort target.** "5×4-6" with no load and no RIR is half a prescription. The rig user had no history, but a user with two months of logs gets exactly the same blank, because the plan path never reads them.
- **Progression is a sentence.** "Add weight or reps when you hit the top of each rep range on all sets" is correct advice and the only place progression exists for week one.
- **43 min shown for a 30 to 45 minute request**, an estimate the user cannot see the basis of.

None of this is the model misbehaving. It is what the rule layer produces from a good exercise pick. That is the important diagnosis: improving the prompt would change little, because the prescription is decided after the model is done.

---

## 4b. Do the sets and reps make sense for the goal?

The numbers below are what `getRoleAwareScheme` in `backend/src/data/set-rep-schemes.ts` actually produces, printed from the function, before the time cap trims accessories. Format is sets × reps.

| Goal | Level | Main lift | Second compound | Isolation | Core | Rest (all rows) |
|---|---|---|---|---|---|---|
| Strength | beginner | 4×5-8 | 4×6-10 | 3×8-12 | 3×12-15 | 90 s (+30 s on the first row) |
| Strength | intermediate | 5×4-6 | 5×5-8 | 3×8-10 | 3×12-15 | 120 s |
| Strength | advanced | 6×3-5 | 5×4-6 | 3×6-10 | 3×12-15 | 150 s |
| Hypertrophy | beginner | 3×10-12 | 3×10-15 | 2×12-15 | 3×12-15 | 60 s |
| Hypertrophy | intermediate | 4×8-12 | 4×10-15 | 3×12-15 | 3×12-15 | 75 s |
| Hypertrophy | advanced | 5×6-10 | 4×8-12 | 3×10-15 | 3×12-15 | 90 s |
| Fat loss | beginner | 3×10-15 | 3×10-15 | 2×15-20 | 3×15-20 | 45 s |
| Fat loss | intermediate | 4×8-12 | 4×10-15 | 3×12-15 | 3×12-15 | 60 s |
| Fat loss | advanced | 4×8-12 | 4×10-15 | 3×12-15 | 3×12-15 | 60 s |
| Endurance | beginner | 3×12-15 | 3×12-15 | 2×15-20 | 3×15-20 | 45 s |
| Endurance | intermediate | 3×12-15 | 3×15-20 | 2×15-20 | 3×15-20 | 45 s |
| Endurance | advanced | 4×12-15 | 3×15-20 | 2×15-20 | 3×15-20 | 30 s |
| Balanced | beginner | 4×8-12 | 4×10-15 | 3×12-15 | 3×12-15 | 75 s |
| Balanced | intermediate | 4×6-10 | 4×8-12 | 3×10-15 | 3×12-15 | 90 s |
| Balanced | advanced | 4×5-8 | 4×6-10 | 3×10-15 | 3×12-15 | 90 s |

Verdict by goal:

- **Strength: mostly right, rest too short.** Heavy main lift at 4-6 or 3-5 reps with 5-6 sets is the correct shape. The rest is 120 to 150 seconds on the main lift; the evidence and every strength app say 3 to 5 minutes for heavy compounds. The 5×5-8 second compound is a lot of heavy work, which is fine until the time cap trims it to 2 sets.
- **Hypertrophy: the table is reasonable and nobody can reach it.** The form offers four goals: fat loss, strength, endurance, balanced. There is no "build muscle" goal. A profile or onboarding goal of Hypertrophy ("Grow muscle size and definition") is mapped to the form's "strength" and gets 5×4-6. The plan style "Strength + muscle focus" is never sent. So the most common goal in a gym app is served a powerlifting scheme. The hypertrophy rows also rest 60 to 90 seconds; the 2016 rest-interval trial found 3 minutes beat 1 minute for size as well as strength.
- **Fat loss: the wrong idea in the lifting rows.** 8 to 15 reps at 45 to 60 seconds rest turns the lifting into a density circuit. Fat loss is set by the diet; the job of the lifting is to keep muscle, which means hypertrophy-style sets with normal rest. The "calorie burn" belongs on the cardio days and the finisher, not in shortened rest on the bench.
- **Endurance: probably backwards for the people who pick it.** Someone who picks Endurance is usually a runner or cyclist wanting strength support. Their lifting rows here are 12 to 25 reps at 30 to 45 seconds rest, 2 to 4 sets, which is more cardio. The endurance-sport literature (Rønnestad and Mujika 2014; Blagrove 2018) finds heavy and explosive strength work improves running economy and performance, not high-rep lifting. Those two papers are from my own knowledge, not fetched in this session's research, so confirm before acting on this one.
- **Balanced: fine.** 4×6-10 main, 4×8-12 second, 3×10-15 isolation at 90 seconds is a sensible general scheme.

Cross-cutting problems, which matter more than any single row:

1. **One rest value per goal.** The base rest is stamped on every strength row, plus 30 seconds on the first row. So a plank and a face pull rest 120 seconds while the squat rests 150. Rest should follow the role: main 3 to 4 minutes, second compound 2 to 3, isolation 60 to 90 seconds, core 45 to 60.
2. **Short sessions are forced to five exercises.** `exerciseTargetsForSession` demands at least 5 exercises for any detailed session up to 38 minutes and 6 up to 55. The working-set cap for a 30 to 45 minute strength session is about 13. Five rows into 13 sets means one main lift at 5 and everything else trimmed to 2. That is the mechanism behind the sample week's 2×5-8 rows. A short session should have 3 or 4 movements at 3 or 4 sets.
3. **Hard days on the simple path use the wrong table.** In the rule-based path, `difficulty = isHardDay ? 'advanced' : experienceLevel`, so a beginner's hard day is stamped with the advanced band (6×3-5 for strength). The single-session endpoint hard-codes advanced or intermediate and ignores experience entirely. The batch path uses the real experience level, which is why the sample was consistent.
4. **"Build" progression is undone by the cap.** Weeks two onward multiply sets by 1.08 to 1.24, then the working-set cap re-clamps to the session length, so on a short session the volume never builds. Rep drops of 1 to 3 per week on a 4-6 main lift land at 3-5 and stop.
5. **A rep range without an effort target is ambiguous.** 5×4-6 at what load, stopping how far from failure? Every row needs an RIR or a load, or both.

What the tables should say, as a starting point for the prescription layer:

| Goal | Main lift | Second compound | Isolation | Core | Rest by role |
|---|---|---|---|---|---|
| Strength | 4-5×3-5, RIR 2 to 1 across the block | 3-4×5-8, RIR 2 | 2-3×8-12 | 2-3×10-15 | 3-4 min / 2-3 min / 60-90 s / 45-60 s |
| Muscle (new goal) | 3-4×6-10, RIR 2 to 0-1 | 3×8-12 | 2-3×10-15 | 2-3×12-20 | 2-3 min / 90-120 s / 60-90 s / 45-60 s |
| Fat loss, lifting rows | same as Muscle | same | same | same | same, plus a 8-12 min conditioning finisher or a cardio day |
| Endurance, support lifting | 3×4-6, RIR 2-3 | 2-3×6-10 | 2×8-12 | 2×12-20 | 2-3 min / 2 min / 60-90 s; cardio volume lives on cardio days |
| Balanced | 4×5-8 | 3×8-12 | 2-3×10-15 | 2-3×12-20 | 2-3 min / 90-120 s / 60-90 s / 45-60 s |

Beginners: the same zones, one fewer set, RIR 3, and week one as calibration. How many exercises a session holds should fall out of the weekly per-muscle tally and the minutes, not a fixed five.

## 5. The good

- **The guardrails work.** Hallucinated ids are replaced, duplicates and cross-day repeats are caught, lower-body lifts cannot land on an upper day, equipment is conformed, cardio is templated, titles are de-hyped. The July generation-quality rounds and the eval harness (137 of 140 on the September captures) are real assets. Most LLM-program critiques in the literature (section 8) are about exactly the failures this pipeline already blocks.
- **The structural prompt is good coaching.** Compounds first, angle variation on repeat days, pattern balance per day, RPE 7 to 8 for intermediates, plain names. The warm-up and "why this workout" copy in the sample is specific and useful, better than most apps show.
- **Cheap and fast.** About $0.01 and 10 seconds for a week; weeks two onward are free. There is headroom to spend more per plan if it buys quality.
- **Preview bones are right.** Week tabs, day cards, a session sheet with warm-up, why, cool-down and per-exercise notes, per-exercise swap that keeps the prescription, rebuild week, reduce intensity, a draft that survives 48 hours and a resume card. Most competitors show less before you commit.
- **The split recommender** (22 patterns scored on goal, style, time and schedule) is a genuinely helpful piece of the form.
- **Transparency instinct.** "What drove this preview" is the right idea, even if today it reads like a debug panel.
- **Injury handling** on templates goes through the joint-demand tags; the catalog metadata to do the same for generation already exists.

---

## 6. The bad, ranked

1. **The prescription has no owner.** Sets and reps come from bands, the set total from a time cap, rest from the goal, load from nowhere, effort from nowhere. No component tallies weekly volume per muscle or checks a session's sets against a target. This is the root of everything in section 4.
2. **History is ignored.** The single most valuable thing the app has, months of logged sets per exercise, does not reach plan generation. There is already an Epley e1RM in `frontend/src/lib/exerciseHistory.ts` and a last-performance query in the generator; neither is wired into the plan path.
3. **The form asks for things that do nothing.** Age, cardio equipment, focus, emphasis, per-day time limits, duration by workout type. The preview's "not in the AI request" list is the app confessing (and it names four more things, formats, two-a-day rules, activity level and preferred lifts, that the form does not even collect). Every dead control costs trust and adds to a step-two wall of about fifteen sections.
4. **Home users lose their equipment.** The home checklist is dropped and replaced by dumbbells, bands and bodyweight. A home lifter with a rack never sees a barbell in a generated plan.
5. **Default plan length is one week**, so the "plan" ends next Monday and the calendar shows an empty week with a "generate a new plan" prompt. Multi-week is where the progression logic lives, and nobody gets there by default.
6. **The rule-based fallback is silent.** When the model fails or "simple" is chosen, the preview still says "AI: Gemini". The September onboarding review flagged this; it is still true.
7. **After Apply, nothing adapts.** Every intelligent lever (replace, rebuild, reduce intensity) is preview-only. Every competitor in section 8 adapts from logged sessions; this app has the logs and does not use them.
8. **Loading is a black box.** One static line for 10 seconds to 150 seconds, no stages, no cancel, and leaving the screen aborts the request. Regeneration actions show a 20-point spinner while the stale week stays interactive.
9. **Errors leak internals.** "Generate sessions: expected 12 sessions, got 10" is shown to users verbatim.
10. **A known preview bug ships empty days.** "Swap Workout" to another type writes a card with no exercises that survives Apply (July checklist 4.5, still open).
11. **Onboarding's AI exit is dead.** The auto-generate path with its progress screen has no caller; the exit lands on the empty three-step form.
12. **The eval measures structure, not coaching.** Nothing scores volume per muscle, effort, load, or whether a week makes sense for the stated experience. A plan of 2-set accessories scores at the ceiling.

---

## 7. What is missing

Measured against both the evidence and the apps people compare us to.

- **A volume model.** Weekly sets per muscle with fractional counting (a compound's secondary movers at 0.5), targets by goal and experience, and at least two exposures per muscle per week. This is the ACSM 2026 and RP framing and the thing every serious app does under the hood.
- **An effort model.** A RIR or RPE target per block that drifts from 3 to 4 early to 0 to 1 late, then a reduced-volume deload. Evidence says hypertrophy needs proximity to failure and strength does not; a plan that never says how hard is incomplete either way.
- **A load model.** Suggested working weight from the user's e1RM for exercises with logs, "find your weight" plus an RIR target for the rest. Hevy and Fitbod both only suggest weights where they have history; that is the honest version.
- **Progression written per exercise, not per plan.** Double progression for novices and hypertrophy, load progression for trained strength; the rule stated on the exercise row.
- **Adaptation after logging.** Post-session check-in (effort, soreness, joint pain) feeding next week's sets, a plateau-triggered deload, and a "regenerate this day" that keeps every constraint. RP, JuggernautAI, Dr. Muscle and Alpha all do some version; it is the feature that makes a plan feel alive.
- **Skill gating by experience.** Cleans, snatches, pistol squats and single-arm push presses should not appear for beginners regardless of tier.
- **Rationale per exercise.** One line per row ("main lift, heaviest of the day", "rows to balance the presses") with a drill-down. No competitor shows this in the UI; it would be a distinctive strength and the model can already write it.
- **Consistent titles after repair.** Rename from the final exercise list.
- **A coach check on the output.** A small deterministic report per plan: volume per muscle, pattern coverage, hinge and press stacking, rest sanity for holds, skill gate. Shown to the user in plain words, and scored in the eval.

---

## 8. What the evidence and the market say (short)

Program design:

- Volume drives hypertrophy with diminishing returns; strength saturates sooner. Count direct and fractional sets. About 10 sets per muscle per week and at least two exposures per week is the current ACSM guidance; RP's landmarks put a minimum effective dose around 4 to 6 sets for chest and quads and a productive zone up to the mid-teens.
- Frequency matters little for size when volume is equal; it helps strength. Frequency is a scheduling tool.
- Load is flexible for size if sets get close to failure; strength needs heavy loads. Prescribing by RIR or RPE with a suggested load performed at least as well as percentage-based loading in trained lifters.
- Rest: 2 to 3 minutes or more on compounds; 60 to 90 seconds on isolation is defensible.
- Order: whatever comes first gains the most strength; put the goal lift first.
- Progression: beginners add 2 to 10 percent load when they exceed target reps; load and rep progression are equivalent for size; periodization earns its complexity only for trained lifters with a strength goal. So a linear or double-progression block is the right default and the clone-and-progress design is defensible, provided the numbers are right.
- Deload: reduced volume, not a week off. Practitioners deload about every 5 to 6 weeks for about 6 days by cutting sets.
- Published critiques of LLM programs list the same defects every time: no explicit progression, vague intensity, volume not tallied, history and injuries ignored, unsafe selection, and run-to-run instability. Our pipeline blocks the selection failures and has the other five.

Products:

- Inputs converge on goal, experience, equipment, days, minutes, an optional priority muscle, constraints, and existing maxes or last logs. Nobody asks for age, cardio equipment or workout formats up front.
- Presentation is either a week-by-day grid with explicit numbers per week (RP, Boostcamp, Alpha, JuggernautAI) or one adaptive session at a time (Fitbod, Dr. Muscle). Rationale per exercise is not shown in any of them.
- Everyone supports per-exercise swap; Boostcamp and JuggernautAI scope it as "this session or all future".
- Adaptation from logs is the norm: Fitbod's per-muscle recovery score and e1RM refinement, RP's post-session questions, JuggernautAI's daily readiness and per-set RPE, Hevy's double-progression rule, Dr. Muscle's plateau deload.
- UX guidance for generative features agrees on: smart defaults over many knobs, section-level regeneration that keeps manual edits, partial explanations with progressive disclosure, honest disclosure of uncertainty and fallbacks, and staged progress rather than a blank wait. Fitbod's documented anti-pattern is regenerate wiping manual edits.

---

## 9. The UI, and how it should be shaped

### 9.1 The form

Today: a three-step wizard, about twenty controls, a template fork at the top of step one, a step two that scrolls through fifteen sections, a review step, and a one-week default.

Recommendation: **one screen of smart defaults, with adjustments behind a disclosure.**

- Top: a single card that states the plan in a sentence built from the profile: "Strength · 4 days (Mon Tue Thu Fri) · 45 min · Upper/Lower · 6 weeks". Every noun is tappable and edits in place. This is what a coach would say back to you before writing anything.
- Below, only the six inputs that change the output: goal, days, minutes, experience, where (gym or home with its equipment), weeks (default 4 to 6, never 1). Injuries shown as chips from the profile with an "edit" affordance.
- "Adjust" disclosure for split (with the recommender), progression style, detail level, cardio types, secondary goal, priority muscle (new; every competitor has it, we have the catalog for it).
- Remove until wired: age, cardio equipment, focus, emphasis, per-day caps, duration by workout type, formats, two-a-day rules, custom split hint. Add them back one at a time only when the backend consumes them.
- Templates versus AI: one framing line at the top of the Calendar's planning card, not a competing card inside the form: "Programs: proven, instant. AI plan: built around your answers, about a minute." The generator should not sell the other product on its own first screen.
- Onboarding: restore the auto-generate exit with the progress screen and an "edit details" escape, defaulting to a multi-week plan.

### 9.2 Generation

Today: one line, no stages, no cancel, leaving aborts.

Recommendation: stage the wait honestly (pick exercises, balance the week, set your numbers, check the plan), keep the request alive if the user leaves (the 48-hour draft already exists), and disclose the path taken: "Built with AI" or "Built by our rules this time (the AI was unavailable)". Put the error copy through one function that never shows internal strings.

### 9.3 The preview

Today: week tabs, a stats row (Sessions, Strength, Has cardio), a debug-style "What drove this preview", adjust chips, day cards with a detail line, a session sheet.

Recommendation:

- Replace the stats row with **a weekly volume strip**: sets per muscle group as small bars with the target band, plus total minutes. This is the one view that makes the plan legible and catches the two-set-accessory problem by eye.
- Show **dates**, not just weekdays, since we asked for a start date.
- Show **load and effort per exercise**: "Bench 4×5 · 165 lb · 2 RIR" where history exists; "Bench 4×5 · find your weight, stop 2 reps short" where it does not.
- Add **one line of rationale per exercise**, with the longer "why this workout" behind a tap. This is the partial-explanation pattern and it is cheap; the model already writes the day-level version.
- **Rebuild this day** (the endpoint exists and has no caller) and **swap this exercise here or in every week**, with manual edits sticky across "Rebuild week".
- Move "What drove this preview" behind a small "How this was built" link and write it in plain words; keep the "not sent" list out of the product entirely by not collecting those fields.
- Fix the empty-day swap bug before anything else ships in this screen.

### 9.3b The preview screen, honestly

Dylan flagged this screen as "iffy". Looking at it as a user: it reads as an admin view of the generator's output, not as "your program". Specifically:

- **The screen explains itself.** A paragraph in the middle of the page tells the user to tap a session and to expand "What drove this preview" for "what was sent to the model". Copy that explains the UI, in the vocabulary of the system, is the screen admitting its layout does not communicate.
- **The stats row says nothing.** "Sessions 4/week · Strength 4 · Has cardio 0". A zero is not a stat. There is no total time, no first-lift summary, no volume.
- **The day cards hide the plan.** Each day shows a blue "S" tile, a title and "43 min • Strength • 5 exercises". You cannot see a single exercise without opening each day. A person judging a plan wants to see the lifts.
- **Destructive controls sit at rest.** Trash and swap icons on every day, always visible.
- **"Adjust this week" chips** (Rebuild Week, Reduce Intensity) sit above the content they change, and Reduce Intensity silently regenerates every week.
- **The session sheet leads with boilerplate.** Title, then an italic progression line, then a grey paragraph about AI and rules and "for education only", and only then the warm-up and the exercises. The legal and transparency text is above the content.
- **No dates, no weights, no effort, no rationale per row.** Already covered in section 9.3.
- **Minor:** a text "← Back" instead of the native chevron the rest of the app uses; a "Week 1" pill when there is one week; "Apply to Plan" is system wording ("Start this plan").

What the screen should be, top to bottom:

1. A plan card: the name, one sentence ("4 days · 45 min · Upper/Lower · 6 weeks · built around strength"), a plain coach check line ("Balanced push and pull. Fits your time. Uses your gym."), and the primary button. Volume detail behind a tap.
2. Weeks as a segmented control only when there is more than one.
3. Each training day expanded: title, minutes, then the first three exercise rows inline with sets, reps, load or RIR, and "and 2 more". Tap for the full session. Rest days as thin rows.
4. Per-row: one line of rationale and a swap that asks "this week or all weeks".
5. Adjust as a secondary menu on the day (Rebuild this day, Shorter, Easier, Swap for cardio), not as a global chip row.
6. Transparency ("How this was built") and the wellness note as a footer link.
7. Edit inputs and Start this plan in the footer, with Start disabled only while generating.

### 9.3c The loader

The wait uses a Skia bench-press silhouette (`BenchPressLoader`) at three sites: the preview's full-screen wait, the per-session regenerate, and the dead onboarding auto-generate path. Dylan wants the logo there instead. The right shape, consistent with the 2026-09-13 decision that the mark is identity only and never a meter: the segmented-J mark at the splash size, a slow breathing pulse in opacity and scale (static when reduce-motion is on), and the staged status lines beneath it (pick exercises, balance the week, set your numbers, check the plan). No mapping of segments to progress. This also removes the Skia guarded-require path from the screen. One component swap, rides the next binary. In the plan it is a Tier 0 item.

### 9.4 After Apply

Today: frozen.

Recommendation: the plan should be a living thing. A three-question check-in after a session (how hard, soreness, any joint pain) feeding the next week's sets; a plateau rule that deloads an exercise; "regenerate this day" that keeps constraints and history. This is the biggest gap to every product in section 8 and the most valuable thing the logs can buy.

---

## 10. What I would do, in order (revised after a second pass)

A second pass on the first draft's plan, read as the person opening "Generate a plan" and as the person who would ask a coach to write one, changed five things: the quick wins are split out, measurement comes first, new users get a calibration week because they have no history to draw loads from, fat-loss and hybrid users get cardio progression (the first draft only looked at strength), and the preview is reshaped for a user rather than a coach with the load landing in the workout deck where it is used. The form rewrite moves last: visible, but the least urgent with ten testers, and independent of everything else.

**Tier 0, quick wins (about a day, backend and small client fixes)**

- Send the home equipment checklist instead of the fixed dumbbell, band and bodyweight list.
- Default plan length to four weeks.
- Rename each session from its final exercise list, after repairs.
- Disclose the path taken: built with AI, or built by rules this time.
- Route every generation error through one function that never shows internal strings.
- Fix the preview's swap-type bug that applies an empty day.
- **Add a "Build muscle" goal to the form** and map the Hypertrophy profile goal to it, so muscle-building users stop getting the strength scheme.
- Rest by role instead of one value per goal (main 3-4 min, second 2-3, isolation 60-90 s, core 45-60 s).
- Drop the five-exercise minimum for sessions under 40 minutes (3 or 4 movements at 3 or 4 sets).
- Hard days use the experience band, never "advanced" for a beginner; the single-session endpoint takes experience.
- Replace the bench-press loader with the logo mark and staged copy (client, rides a binary).

**Tier 1, measure first (two or three days)**

- A deterministic coach check per plan: sets per muscle per week with fractional counting, exposures per muscle, hinge and press stacking, rest sanity for holds, a skill gate by experience, and whether every row carries an effort target and, where possible, a load.
- The same checks become eval dimensions; re-baseline the existing captures so the next tier is built against numbers that can move.

**Tier 2, the prescription layer (the big one, backend only)**

1. Session set budget from minutes (about one working set per 2.5 to 3 minutes including rest), 3 to 5 exercises at 3 to 5 sets rather than 5 at 2, rest by role. The bands in `set-rep-schemes.ts` become inputs, not the answer.
2. Weekly per-muscle tally against targets by goal and experience, at least two exposures per muscle, the pattern floors folded in.
3. Effort: an RIR target per week that drifts from 3-4 to 1, and a reduced-volume deload.
4. Loads: pass the user id into `generate-sessions`; an Epley e1RM from logged sets gives a working load where history exists. Where it does not, **week one is a calibration week**: each main lift gets a ramp instruction and a top set at a stated RIR, the deck logs it, and week two's loads come from that. An optional "current lifts" entry on the form lets a user skip calibration.
5. Cardio for fat-loss, endurance and hybrid goals: intervals and steady work that progress week to week, not a fixed template.
6. Injuries pre-filter candidates through the joint-demand tags; experience gates exercise skill; saved and preferred exercises become candidates.

**Tier 3, show it (frontend, rides a binary)**

- Preview top: the week at a glance (days, minutes, first lift of each day) and a plain coach check ("balanced, fits your 45 minutes, uses your gear"). The per-muscle volume detail sits behind a tap, not as the hero.
- Each exercise row: load and RIR where known, "find your weight, stop 2 reps short" where not, one line of rationale, the longer "why" behind a tap.
- Dates, rebuild this day, swap here or in every week, manual edits sticky across rebuild, staged progress, the request kept alive when the user leaves.
- The workout deck shows the suggested load and RIR where the user actually lifts; the calibration top set is a first-class step there.

**Tier 4, make the plan live (backend plus a binary)**

- A three-question check-in after a session (how hard, soreness, joint pain) that adjusts next week's sets; a plateau rule that deloads an exercise; regenerate-a-day that keeps constraints and history.
- At the end of a block, a "next block" built from this block's logs, which is consistent with the no-roll-forward rule: nothing repeats silently, the user is offered the continuation.

**Tier 5, the form (frontend, last)**

- One screen of smart defaults, the plan stated back as a sentence with tappable nouns, adjustments behind a disclosure.
- Wire what a coach asks first: current activity level (exists in the request, never collected) and an optional three-lift "current numbers" entry; add a priority muscle.
- Remove the dead controls, move the templates framing out of the generator, restore the onboarding auto-generate exit.

**Model and cost.** Do not spend the next effort on a stronger model. The model is not deciding the things that are wrong. Once the prescription layer exists, a week-one design call on a stronger model (Sonnet 5 at about three cents a plan) is a cheap experiment to run through `eval:drive`, and a second provider remains parked.

**What not to do.** Do not add more knobs to the form. Do not ask the model for sets, reps and loads directly; the literature on run-to-run instability says a rule layer must own the numbers. Do not surface the "not sent" list to users; remove the inputs instead.

## 11. Where things live

- Form: `frontend/src/screens/GeneratePlanScreen.tsx` (3-step wizard, about 3,000 lines); recommender `frontend/src/lib/planRecommendation.ts`; payload `frontend/src/lib/planInputs.ts`, `planPipeline.ts` (`buildGenerateSessionsRequest`), `planGenerationSummary.ts` (progression table, meso hint, "what drove" lines).
- Preview: `frontend/src/screens/PlanPreviewScreen.tsx`; drafts `planPreviewDraftStorage.ts`; move logic `planPreviewMove.ts`.
- Backend: `backend/src/plans/plans.service.ts` (`generateSessions`, chunking, clone, paths), `workouts/workout-generator.service.ts` (prompts, candidate list, single-session path, rule fallback), `plans/session-enrichment.ts` (re-stamping, caps, rest, reasoning), `plans/week-pattern-floors.ts`, `plans/week-progression.ts`, `data/set-rep-schemes.ts`, `plans/eval/` (scoring, invariants, captures).
- History that exists and is unused by plans: `frontend/src/lib/exerciseHistory.ts` (Epley e1RM), `workout-generator.service.ts` `getLastPerformanceForExercises` and `getRecentExerciseIds`.

## 12. Sources

Program design
- Schoenfeld, Ogborn, Krieger 2017, weekly volume dose-response: https://pubmed.ncbi.nlm.nih.gov/27433992/
- Pelland et al. 2025/26, dose-response meta-regressions (direct and fractional sets): https://pubmed.ncbi.nlm.nih.gov/41343037/ and https://link.springer.com/article/10.1007/s40279-025-02344-w
- ACSM 2026 resistance training update: https://acsm.org/resistance-training-guidelines-update-2026/
- ACSM 2009 position stand, progression models: https://pubmed.ncbi.nlm.nih.gov/19204579/
- RP Strength volume landmarks: https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth ; chest guide https://rpstrength.com/blogs/articles/chest-training-tips-hypertrophy ; quad guide https://rpstrength.com/blogs/articles/quad-training-tips-hypertrophy
- Schoenfeld, Grgic, Krieger 2019, frequency: https://pubmed.ncbi.nlm.nih.gov/30558493/ ; Schoenfeld 2016 frequency: https://link.springer.com/article/10.1007/s40279-016-0543-8 ; Grgic 2018 frequency and strength: https://pubmed.ncbi.nlm.nih.gov/29470825/
- Schoenfeld 2017 low vs high load: https://pubmed.ncbi.nlm.nih.gov/28834797/ ; Lopez 2021 load network meta: https://pubmed.ncbi.nlm.nih.gov/33433148/ ; Schoenfeld 2021 repetition continuum: https://www.mdpi.com/2075-4663/9/2/32
- Robinson et al. 2024 proximity to failure: https://pubmed.ncbi.nlm.nih.gov/38970765/ ; Refalo 2023: https://pubmed.ncbi.nlm.nih.gov/36334240/
- Helms 2018 RPE vs percentage loading (via Europe PMC search)
- Schoenfeld 2016 rest intervals: https://journals.lww.com/nsca-jscr/fulltext/2016/07000/longer_interset_rest_periods_enhance_muscle.3.aspx ; NSCA rest review: https://journals.lww.com/nsca-scj/Fulltext/2008/06000/A_Brief_Review__How_Much_Rest_between_Sets_.9.aspx ; Davidson & Barillas 2025 preprint: https://www.medrxiv.org/content/10.1101/2025.09.22.25336351v1
- Nunes 2021 exercise order: https://pubmed.ncbi.nlm.nih.gov/32077380/ ; Haugen 2023 free weights vs machines: https://pubmed.ncbi.nlm.nih.gov/37582807/ ; unilateral vs bilateral 2026: https://link.springer.com/article/10.1186/s13102-026-01834-2
- NSCA 2-for-2 rule summary: https://www.ptpioneer.com/personal-training/certifications/nsca-cpt/nsca-cpt-chapter-15/ ; Plotkin 2022 progression: https://peerj.com/articles/14142/ ; Stronger by Science on progression: https://www.strongerbyscience.com/progressive-overload-strategies/
- Moesgaard 2022 periodization: https://pubmed.ncbi.nlm.nih.gov/35044672/ ; Grgic 2017 linear vs undulating: https://peerj.com/articles/3695/
- Coleman 2024 deload RCT: https://peerj.com/articles/16777.pdf ; deloads in untrained men 2026: https://www.nature.com/articles/s41598-026-40612-5 ; Bell 2024 deload survey: https://link.springer.com/article/10.1186/s40798-024-00691-y

LLM-generated programs
- Düking 2024: https://pubmed.ncbi.nlm.nih.gov/38524820/
- Havers 2025 (GPT-4 vs Gemini, reproducibility): https://www.termedia.pl/Reproducibility-and-quality-of-hypertrophy-related-training-plans-generated-by-GPT-4-and-Google-Gemini-as-evaluated-by-coaching-experts,78,55336,1,1.html
- Professional assessment 2025: https://pmc.ncbi.nlm.nih.gov/articles/PMC12492345/ ; ChatGPT versions compared: https://link.springer.com/article/10.1186/s13102-025-01409-7
- Systematic review, the AI recommendation paradox: https://pmc.ncbi.nlm.nih.gov/articles/PMC13343266/
- Zaleski 2024 (JMIR Med Educ) via Europe PMC
- Consistency preprints: https://arxiv.org/abs/2604.11287 and https://arxiv.org/abs/2604.19598

Products
- Fitbod algorithm: https://fitbod.me/blog/fitbod-algorithm/ ; recovery: https://fitbod.me/blog/muscle-recovery/ ; help centre: https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout
- Hevy Trainer: https://www.hevyapp.com/announcing-hevy-trainer/
- JuggernautAI reviews: https://www.garagegymreviews.com/juggernautai-review and https://powerliftingtechnique.com/juggernaut-ai-review/
- RP Hypertrophy: https://rpstrength.com/pages/hypertrophy-app and https://dr-muscle.com/rp-hypertrophy-app-for-strength-training-expert-review/
- Alpha Progression: https://alphaprogression.com/en ; Dr. Muscle: https://dr-muscle.com/what-makes-dr-muscle-different/
- Freeletics: https://www.freeletics.com/en/blog/posts/AI-and-your-Coach/ ; Future: https://agent-finder.co/reviews/future ; Boostcamp: https://www.garagegymreviews.com/boostcamp-review

UX
- Google PAIR explainability: https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/ ; Microsoft HAX guidelines: https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/
- Weisz et al. CHI 2024: https://arxiv.org/html/2401.14484v1 ; Shape of AI: https://www.shapeof.ai/ ; Smashing Magazine 2025: https://www.smashingmagazine.com/2025/07/design-patterns-ai-interfaces/
- NN/g: https://www.nngroup.com/articles/accordion-editing-apple-picking/ and https://www.nngroup.com/articles/ai-hallucinations/
