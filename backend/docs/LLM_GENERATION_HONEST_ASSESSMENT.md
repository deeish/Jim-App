# Brutally Honest Assessment: LLM Workout Generation

**Perspective:** A gym person who knows programs, and a beginner who doesn’t.

---

## What’s Actually Good

- **Slots (compound → accessory → finisher)** – Matches how people who train seriously structure a session. Beginners get a logical order without having to think.
- **Goal-based set/rep** – Strength vs hypertrophy vs endurance is respected in the prompt. A gym person would recognize the rep ranges.
- **Anchors + variety** – Bench/squat/deadlift/rows etc. show up; rotation and shuffle avoid “same 5 exercises forever.”
- **Push/Pull/Legs muscle groups** – Candidates are now focused (push = chest/shoulders/arms, etc.), so the list isn’t random.
- **Limitations in the prompt** – “Bad knee”, “no barbell” etc. are passed through. That’s exactly what a beginner or injured person needs.
- **Last performance → progression** – We send “last time 135×8” and ask the model to suggest a small bump. Concept is right for progression.
- **Reasoning on the plan screen** – The “why this workout” + warm-up/cool-down lives in `reasoning` and is shown in the plan detail sheet. So it’s not hidden.

So the **layout and logic** are in the right place for both a gym person and a beginner. The main issues are **what we never surface**, **what we never tell the model clearly**, and **one structural weakness**.

---

## 1. Rest Between Sets: We Have It, We Don’t Use It

**Reality:** `set-rep-schemes.ts` has `restSeconds` (e.g. 90 for strength beginner, 120 for intermediate). We **never** put it in the prompt and **never** show it in the UI.

- **Gym person:** Expects to see “Rest 90–120 sec” so they can actually run the session like a program.
- **Beginner:** Doesn’t know how long to rest; they guess or rest too long/short.

**Fix:**  
- Add one line to the LLM prompt: e.g. `Rest: ${setRep.restSeconds} sec between sets (user's goal/difficulty).`  
- Optionally add `restSeconds` to the workout or exercise payload and show “Rest 90 sec” (or similar) in the workout/plan UI so it’s visible when they’re about to train.

---

## 2. “Why This Exercise” Is Missing for Beginners

**Reality:** We tell the model to fill slots (e.g. “horizontal push”, “vertical pull”). The user gets **exercise name, sets, reps, maybe weight/notes**. They do **not** get a short “why this exercise” or “what to focus on” per movement.

- **Gym person:** Can infer from the name and slot.
- **Beginner:** Doesn’t know why “Incline Dumbbell Press” is there or what “horizontal push” means. They’d benefit from one line per exercise, e.g. “Main chest press after warm-up; focus on controlled reps.”

**Fix:**  
- In the system or user prompt, ask for an optional one-line `notes` or `focus` per exercise (e.g. “Main compound – go heavy” or “Chest isolation – squeeze at top”).  
- Show that in the workout/plan UI so beginners see intent, not just name/sets/reps.

---

## 3. Weight Is Optional and Often Empty

**Reality:** We allow `weight` in the JSON and pass last performance so the model *can* suggest weight. But we don’t strongly require it, and many exercises will come back with no weight.

- **Gym person:** Used to choosing weight; fine.
- **Beginner:** “How much weight?” is the first question. Empty weight + no “start light” note = confusion.

**Fix:**  
- In the prompt, for **beginner** (or when experience is beginner): “For each exercise, suggest a starting weight in the 'weight' field when possible, or in 'notes' (e.g. 'Start light, add weight when 10 reps feel easy').”  
- So beginners get either a number or a clear note instead of a blank.

---

## 4. Warm-Up and Cool-Down Are Buried in “Reasoning”

**Reality:** We ask the model to put warm-up and cool-down **inside** the `reasoning` string. So they’re in the same block as “Push day, horizontal push first…”.

- **Gym person:** Can find it.
- **Beginner:** Might not realize the first sentence is the warm-up and the last is the cool-down. It’s not clearly labeled in the UI.

**Fix (optional but strong):**  
- Either: ask the model for separate `warmUp` and `coolDown` fields (1–2 sentences each) and show them as distinct sections in the app (e.g. “Warm-up”, “Workout”, “Cool-down”).  
- Or: in the UI where you show `reasoning`, parse or display the first/last sentence with labels “Warm-up: …” and “Cool-down: …” so it’s obvious.

---

## 5. One Big Structural Weakness: We Don’t Enforce “One Exercise Per Slot”

**Reality:** We describe slots in the prompt (“Slot 1: horizontal push, Slot 2: vertical push…”) and say “fill in order”. We do **not** require the model to return exactly one exercise per slot or to tag each exercise with a slot. So we can get:

- 2 exercises for “horizontal push” and 0 for “vertical push”, or  
- 6 exercises in a random order.

The **order** we get is whatever the model returns; we don’t validate it against slots.

- **Gym person:** Might get a weird balance (e.g. too much chest, no OHP).
- **Beginner:** Same issue, plus they’re less able to notice.

**Fix (efficient and robust):**  
- **Option A (prompt-only):** Tighten the prompt: “Return exactly one exercise per slot in this order: Slot 1, Slot 2, … Do not add extra exercises beyond the slots (except optional finisher).”  
- **Option B (code backup):** If you have 5 slots and the model returns 7 exercises, in code you could **map** exercises to slots by position (1st → slot 1, 2nd → slot 2, …) and optionally reorder or drop duplicates. That way even a sloppy response still fits the intended structure.

---

## 6. Efficiency: Is the Prompt Too Long or Noisy?

**Reality:** The user prompt is long (list + focus + difficulty + duration + equipment + set/rep + slots + user context + program context + warm-up instruction + last performance + cardio hint + variety line). For a 70B model that’s fine; it’s not inefficient. The only inefficiency is **sending a huge candidate list** (up to 80 exercises) every time. A smaller, tighter list (e.g. 30–40) that still includes anchors and variety would be enough and might reduce noise.

**Verdict:** Layout is fine. Optional tweak: cap candidates at ~40 and ensure anchors + shuffled non-anchors still fit.

---

## 7. Beginner-Specific: No “What to Expect” or Difficulty Check

**Reality:** We pass “difficulty” and “experience” and the model can infer. But we never ask for:

- A single “session focus” line (e.g. “Form and control today” for beginner, “Progressive overload” for advanced).  
- Or a note like “This is a moderate-length session; take rest as needed.”

So the **tone** of the workout is left to the model. Sometimes it might sound too intense for a beginner or too vague for an advanced lifter.

**Fix (optional):**  
- Add one line to the prompt: “For beginner: add a short note in reasoning that the session is about form and consistency. For advanced: note that they can push intensity.”  
- Or a dedicated `sessionNote` field and show it at the top of the workout in the UI.

---

## Summary: What to Fix First (No Fluff)

| Priority | Issue | Fix |
|----------|--------|-----|
| 1 | Rest between sets never used | Add `restSeconds` to prompt; optionally to API/UI |
| 2 | Slot structure not enforced | Stricter prompt (“exactly one per slot”) and/or map response to slots in code |
| 3 | Beginner weight/notes | For beginner, require weight or “start light” note per exercise |
| 4 | Warm-up/cool-down not obvious in UI | Separate fields or clearly label in reasoning display |
| 5 | “Why this exercise” for beginners | Ask for optional one-line notes per exercise; show in UI |
| 6 | Optional | Slightly smaller candidate list (~40); session note for beginner vs advanced |

**Bottom line:** For a gym person, the layout is good and efficient; the main gaps are **rest times** and **slot discipline**. For a beginner, the gaps are **rest**, **starting weight or clear “start light” note**, and **clear warm-up/cool-down and “why this exercise”** so they’re not left guessing. Fixing 1–4 would make the same system feel much more professional and beginner-friendly without changing the overall architecture.
