# Plan Generation: How It Works, What’s Wrong, and What Can Go Wrong

## How it works (end-to-end)

### 1. User taps “Generate Week 1 Preview” (Generate Plan screen)

- Form state is turned into a **PlanInputs** snapshot (goal, days, duration, split, avoid list, etc.).
- App navigates to **Plan Preview** with `planInputs`, legacy `inputs`, and a new `draftId`.

### 2. Plan Preview loads and runs the pipeline

- **Stages 1–4 (sync, frontend)**  
  - **Stage 1:** Effective split (e.g. “upper_lower” or AI recommendation).  
  - **Stage 2:** Week skeleton: which weekdays are strength / cardio / recovery / rest (7‑day rule, selected days only).  
  - **Stage 3:** Template mapping (e.g. Upper, Lower, Upper, Lower for 4‑day U/L).  
  - **Stage 4:** **SessionSpecs** per week: type, title, duration, isHardDay, avoidConstraints, etc.

- **Stage 5 (async, backend)**  
  - Frontend builds a single request: context (goal, location, detailLevel, avoidConstraints) + one **session** object per non‑rest day (type, title, durationMin/Max, isHardDay, weekIndex, weekday).  
  - **POST /plans/generate-sessions** (auth required).  
  - Backend loops over each session and, for each, calls **WorkoutGeneratorService.generateWorkout()** (no userId):  
    - Groq is used if `GROQ_API_KEY` is set and there are enough exercise candidates; otherwise rule‑based.  
    - Returns name, reasoning, warmUp, coolDown, exercises (name, sets, reps, notes, exerciseId).  
  - Backend responds with `{ sessions: [ ... ] }` in the **same order** as the request.

- **Stage 6 (frontend)**  
  - Response is **normalized**: match each result to a week/day by `weekIndex` + `weekday`, and build **SessionDraft** (title, warmup, whyThisWorkout, cooldown, exercises).  
  - If `sessions.length !== request.sessions.length`, the pipeline **throws** and the UI shows “Couldn’t generate. Try again.”

- **Stage 7 (frontend)**  
  - Metrics (sessions per week, strength/cardio/hard counts) are computed from the draft.

- **Validation / repair**  
  - Draft is validated (every week has 7 days, correct weekdays).  
  - If invalid and `repairIfInvalid: true`, missing days are filled with rest; otherwise the run fails.

### 3. UI shows the plan

- Draft is converted to the legacy **WeekPlan[]** shape (week tabs, workouts per day).  
- User can regenerate week/cardio, make easier, swap, apply to plan, or edit inputs.

---

## What’s wrong or inconsistent in the implementation

1. **Equipment / location not used for exercise choice**  
   - We send `location` (gym/home) and `detailLevel` in the request, but the **backend does not pass** `equipment` (or location) into `generateWorkout` preferences.  
   - The generator uses `preferences.equipment` only when building the candidate list. So for “home” we still get the same candidate pool as “gym” and may suggest barbell/machine exercises.  
   - **Fix (if you want):** In `PlansService.generateSessions`, when building preferences, set `equipment` (or a minimal list) from `dto.location` (e.g. home → limited equipment) so the generator can filter candidates.

2. **detailLevel is unused**  
   - Frontend sends `detailLevel` (simple/detailed). Backend does not pass it to the generator. So “detailed” doesn’t change prompts or structure yet.  
   - **Fix (if you want):** Thread `detailLevel` into the generator (e.g. prompt or exercise count) and use it there.

3. **No request timeout**  
   - The frontend `api` client (axios) has no specific timeout for **POST /plans/generate-sessions**.  
   - If the backend is slow (many sessions, slow Groq), the request can hang until the browser or server times out (often 60s+).  
   - **Fix:** Set a reasonable timeout for this call (e.g. 90s) and show a clear “Request timed out” error.

4. **Regenerate refetches everything**  
   - “Regenerate week” and “Regenerate cardio” and “Make it easier” all call **runPipelineSafe** again, so they **regenerate every session** in the plan, not just the week or cardio sessions.  
   - So “Regenerate cardio” still hits the backend for all sessions (including strength) and replaces the whole plan.  
   - **Fix (if you want):** Either accept “full regen” as the behavior, or add a backend option (e.g. “only regenerate these session indices”) and only send those specs.

---

## Issues you might run into (in practice)

### Latency and timeouts

- **Many sessions = long wait**  
  - Backend does **one** `generateWorkout()` per session, **sequentially**.  
  - Example: 4 sessions × ~5–15s per Groq call ⇒ 20–60s.  
  - User sees “Generating Week Preview…” for the whole time. If the backend or Groq is slow, they may think the app is stuck.  
- **Mitigation:** Keep the loading state and message; consider a timeout (see above) and, later, per‑session or per‑week progress (e.g. “Generating 2/4…”).

### Backend / Groq failures

- **One session fails ⇒ whole request fails**  
  - If any `generateWorkout()` throws (Groq error, parse error, etc.), `generateSessions` throws and returns 5xx.  
  - Frontend gets an error and shows “Couldn’t generate. Try again.” (no partial plan).  
- **Missing or invalid JSON from Groq**  
  - The generator already falls back to rule‑based when Groq fails; if both paths failed we’d throw. So you only see a generic error unless you log on the backend.

### Auth and network

- **401 on generate-sessions**  
  - Endpoint is behind `AuthGuard`. If the token is missing or expired, the client gets 401 and the global interceptor may sign the user out.  
  - User would need to sign in again and retry.  
- **Network errors**  
  - Any network failure (no internet, server down) causes the pipeline to throw and the same “Couldn’t generate. Try again.” + Retry.

### Content quality

- **Avoid list only in prompt**  
  - “Avoid overhead” and similar are passed as `avoidConstraints` and used in the generator’s prompt. The model might still occasionally suggest overhead work; there’s no strict post‑validation that removes such exercises.  
- **No per‑exercise validation**  
  - We don’t check that exercise names or IDs exist in your library. If Groq returns an unknown or made‑up exercise, it still appears in the plan (with whatever name/ID it returned).

### Multi‑week plans

- **Weeks > 1**  
  - We send **all** sessions for **all** weeks in one request. So 2 weeks × 4 sessions = 8 backend calls in a row.  
  - Latency and timeout risk scale with total session count.

### Response length check

- **Strict count check**  
  - We require `sessions.length === request.sessions.length`. If the backend ever returns fewer (e.g. bug or partial failure that still returns 200), the frontend throws and shows an error.  
  - That’s intentional so we never show a half‑filled week.

---

## Quick reference

| Area              | Current behavior                                      | Risk / limitation                              |
|-------------------|--------------------------------------------------------|-----------------------------------------------|
| Location (gym/home) | Sent but not used for exercise selection              | Home users may get gym-only exercises         |
| detailLevel       | Sent but not used                                     | “Detailed” has no effect                      |
| Timeout           | No specific timeout for generate-sessions             | Long hangs on slow backend/Groq               |
| Regenerate        | Full pipeline re-run (all sessions)                  | “Regenerate cardio” still regens everything    |
| One session fails | Whole generateSessions fails                          | No partial plan; user must retry               |
| Auth              | Required; 401 can trigger sign-out                    | User must be logged in; expired token = sign out |

Fixing the “what’s wrong” items (equipment/location, detailLevel, timeout) and being aware of the “issues you might see” (latency, failures, auth) will make the current implementation more robust and predictable.
