# Database Schema Design (MVP)

This document defines the data models and relationships for the Jim workout app backend, aligned with the frontend structures (exercises, workout plans, logs) and intended to avoid costly migrations later.

---

## 1. Design principles

- **Exercise library**: Exercises are reference data loaded from `exercises_5000plus.json`. Each has a **unique string id** (e.g. `bench_press_barbell_flat`). There is no `Exercise` table; all references use this `exerciseId` string.
- **Plans vs workouts**: A **WorkoutPlan** is a multi-week template (e.g. "January 2025"). **PlanWorkout** is one slot (e.g. "Upper Body" on Friday, Week 2). **Workout** is a concrete workout template (standalone or created from a plan) that can be performed and logged.
- **Logs**: **WorkoutLog** records a completed session (which workout, when, summary). **WorkoutLogEntry** and **CompletedSet** store per-exercise and per-set results.
- **Users**: **User** is required for **WorkoutLog** (logs belong to a user). Plans and standalone workouts can be user-scoped (`userId` optional until auth is fully in place).

---

## 2. Entity relationship overview

```
User
  ├── WorkoutPlan[]        (plans owned by user)
  ├── Workout[]            (standalone workouts, optional owner)
  └── WorkoutLog[]         (completed sessions)

WorkoutPlan
  └── PlanWorkout[]        (slots per week/day)

PlanWorkout
  └── PlanExercise[]       (exercises in this slot; exerciseId → library)

Workout
  ├── workoutPlanId?      (if created from a plan)
  ├── planWorkoutId?      (source slot)
  └── WorkoutExercise[]    (exercises; exerciseId → library)

WorkoutLog
  ├── userId
  ├── workoutId           (template used)
  ├── WorkoutLogEntry[]
  └── ...

WorkoutLogEntry
  └── CompletedSet[]
```

---

## 3. Tables and fields

### 3.1 User

| Field      | Type     | Notes                    |
|-----------|----------|--------------------------|
| id        | UUID     | PK                       |
| email     | String?  | Optional until auth      |
| name      | String?  | Display name             |
| createdAt | DateTime |                          |
| updatedAt | DateTime |                          |

**Relations**: WorkoutPlan (one-to-many), Workout (one-to-many), WorkoutLog (one-to-many).

---

### 3.2 Exercise library (no table)

- **Source**: `data/exercises_5000plus.json`, served via ExercisesService.
- **Unique identifier**: `id` from JSON (e.g. `bench_press_barbell_flat`).
- **References**: Everywhere we need “which exercise” we store this string:
  - `PlanExercise.exerciseId`
  - `WorkoutExercise.exerciseId`
  - `WorkoutLogEntry.exerciseId`

---

### 3.3 WorkoutPlan

| Field      | Type    | Notes                          |
|-----------|---------|----------------------------------|
| id        | UUID    | PK                              |
| userId    | String? | FK → User (optional until auth) |
| name      | String  | e.g. "January 2025 Plan"         |
| createdAt | DateTime|                                  |
| updatedAt | DateTime|                                  |

**Relations**: User (many-to-one), PlanWorkout (one-to-many).

---

### 3.4 PlanWorkout

One workout slot in a plan (e.g. “Upper Body” on Friday, Week 2).

| Field           | Type    | Notes                              |
|-----------------|---------|------------------------------------|
| id              | UUID    | PK                                 |
| workoutPlanId   | String  | FK → WorkoutPlan                   |
| weekNumber      | Int     | 1-based week in plan               |
| dayOfWeek       | String  | "Monday" … "Sunday"                 |
| title           | String  | e.g. "Upper Body"                   |
| detailLine      | String? | e.g. "6 exercises · push focus"    |
| type            | String  | "strength" \| "cardio" \| "recovery" |
| durationMinutes | Int     |                                    |
| intensity       | String? | "Easy" \| "Medium" \| "Hard"        |
| orderInDay      | Int     | When multiple workouts per day     |
| createdAt       | DateTime|                                    |
| updatedAt       | DateTime|                                    |

**Relations**: WorkoutPlan (many-to-one), PlanExercise (one-to-many).

---

### 3.5 PlanExercise (join: plan workout ↔ exercise)

| Field         | Type    | Notes                          |
|---------------|---------|--------------------------------|
| id            | UUID    | PK                             |
| planWorkoutId | String  | FK → PlanWorkout               |
| exerciseId    | String  | Library exercise id            |
| name          | String? | Denormalized for display       |
| sets          | Int     |                                |
| reps          | Int     |                                |
| weight        | Float?  |                                |
| notes         | String? |                                |
| orderIndex    | Int     | Order within the workout       |
| createdAt     | DateTime|                                |
| updatedAt     | DateTime|                                |

**Relations**: PlanWorkout (many-to-one). No FK to a table for exercises (library is file-based).

---

### 3.6 Workout

Standalone or plan-derived workout template (what the user actually “does” and can log).

| Field            | Type    | Notes                          |
|------------------|---------|--------------------------------|
| id               | UUID    | PK                             |
| userId           | String? | FK → User (optional)            |
| name             | String  |                                |
| day              | String? | e.g. "Monday"                  |
| estimatedDuration| Int?    | Minutes                        |
| focus            | String? | e.g. "Full Body", "Push"       |
| workoutPlanId    | String? | FK → WorkoutPlan (if from plan)|
| planWorkoutId    | String? | FK → PlanWorkout (source slot) |
| createdAt        | DateTime|                                |
| updatedAt        | DateTime|                                |

**Relations**: User (many-to-one), WorkoutPlan (many-to-one), PlanWorkout (many-to-one), WorkoutExercise (one-to-many), WorkoutLog (one-to-many).

---

### 3.7 WorkoutExercise (exercise in a Workout)

Replaces the previous embedded “Exercise” concept; links to library via `exerciseId`.

| Field      | Type    | Notes                    |
|------------|---------|--------------------------|
| id         | UUID    | PK                       |
| workoutId  | String  | FK → Workout             |
| exerciseId | String? | Library id (optional)    |
| name       | String  | Denormalized display     |
| sets       | Int     |                          |
| reps       | Int     |                          |
| weight     | Float?  |                          |
| notes      | String? |                          |
| orderIndex | Int     | Order in workout         |
| createdAt  | DateTime|                          |
| updatedAt  | DateTime|                          |

**Relations**: Workout (many-to-one). No FK to exercise library (file-based).

---

### 3.8 WorkoutLog

One completed workout session.

| Field            | Type    | Notes                    |
|------------------|---------|--------------------------|
| id               | UUID    | PK                       |
| userId           | String  | FK → User (required)      |
| workoutId        | String  | FK → Workout (template)  |
| startedAt        | DateTime|                          |
| completedAt      | DateTime? | When finished          |
| totalTimeSeconds | Int?    |                          |
| totalSets        | Int?    |                          |
| totalVolume      | Float?  | Volume (reps × weight)   |
| overallNotes     | String? |                          |
| createdAt        | DateTime|                          |
| updatedAt        | DateTime|                          |

**Relations**: User (many-to-one), Workout (many-to-one), WorkoutLogEntry (one-to-many).

---

### 3.9 WorkoutLogEntry

One exercise within a logged session.

| Field        | Type    | Notes              |
|--------------|---------|--------------------|
| id           | UUID    | PK                 |
| workoutLogId | String  | FK → WorkoutLog    |
| exerciseId   | String  | Library id         |
| name         | String? | Denormalized       |
| orderIndex   | Int     | Order in log       |
| notes        | String? |                    |
| createdAt    | DateTime|                    |
| updatedAt    | DateTime|                    |

**Relations**: WorkoutLog (many-to-one), CompletedSet (one-to-many).

---

### 3.10 CompletedSet

One set within a log entry.

| Field            | Type    | Notes        |
|------------------|---------|--------------|
| id               | UUID    | PK           |
| workoutLogEntryId| String  | FK → WorkoutLogEntry |
| setNumber        | Int     | 1-based      |
| reps             | Int     |              |
| weight           | Float?  |              |
| rpe              | Int?    | 1–10         |
| completed        | Boolean |              |
| notes            | String? |              |
| createdAt        | DateTime|              |
| updatedAt        | DateTime|              |

**Relations**: WorkoutLogEntry (many-to-one).

---

## 4. Unique identifiers and relationships summary

| Concept        | Unique id              | Relationship summary |
|----------------|------------------------|----------------------|
| User           | `User.id` (UUID)       | Owner of plans, optional owner of workouts, required for logs |
| Exercise (lib) | `exerciseId` (string)  | Referenced by PlanExercise, WorkoutExercise, WorkoutLogEntry |
| WorkoutPlan    | `WorkoutPlan.id`       | Has many PlanWorkouts (by week + day) |
| PlanWorkout    | `PlanWorkout.id`       | Has many PlanExercises; can be source of a Workout |
| Workout        | `Workout.id`           | Has many WorkoutExercises; referenced by WorkoutLog |
| WorkoutLog     | `WorkoutLog.id`        | Belongs to User and Workout; has many WorkoutLogEntries |
| WorkoutLogEntry| `WorkoutLogEntry.id`   | Belongs to WorkoutLog; has many CompletedSets |

---

## 5. Frontend alignment

- **types/workout.ts**
  - `Exercise` → maps to **WorkoutExercise** (and library via `exerciseId`).
  - `Workout` → **Workout** + **WorkoutExercise[]**.
  - `CompletedSet` / `ExerciseSession` → **WorkoutLogEntry** + **CompletedSet**.
- **PlanScreen / PlanPreviewScreen**
  - `PlanWorkout` → **PlanWorkout** (with weekNumber, dayOfWeek, type, etc.).
  - `Record<DayOfWeek, PlanWorkout[]>` → query **PlanWorkout** by WorkoutPlan + week.
- **WorkoutSession onComplete**
  - Payload → create **WorkoutLog** + **WorkoutLogEntry** + **CompletedSet** rows.

---

## 6. Migration from current schema

Current Prisma models:

- **Workout**: id, name, day, createdAt, updatedAt.
- **Exercise**: id, name, sets, reps, weight, notes, workoutId.

Steps:

1. Add **User** (no dependency on existing data).
2. Add **WorkoutPlan**, **PlanWorkout**, **PlanExercise** (new feature).
3. Add **WorkoutLog**, **WorkoutLogEntry**, **CompletedSet** (new feature).
4. Extend **Workout**: add userId?, estimatedDuration?, focus?, workoutPlanId?, planWorkoutId? (all optional).
5. Replace **Exercise** with **WorkoutExercise**:
   - Create table `workout_exercises` with workoutId, exerciseId?, name, sets, reps, weight, notes, orderIndex.
   - Migrate data: `INSERT INTO workout_exercises (id, workoutId, name, sets, reps, weight, notes, orderIndex) SELECT id, workoutId, name, sets, reps, weight, notes, 0 FROM exercises`.
   - Drop **Exercise** model and `exercises` table.

For a fresh install or dev reset, applying the new schema and running `prisma migrate reset` (or equivalent) is enough.

### Applying the schema

1. **Generate client**: `npx prisma generate`
2. **Create and apply migration**: `npx prisma migrate dev --name mvp_schema`
   - This creates new tables (`users`, `workout_plans`, `plan_workouts`, `plan_exercises`, `workout_exercises`, `workout_logs`, `workout_log_entries`, `completed_sets`) and drops the old `exercises` table.
   - If you need to keep existing workout/exercise data, run a custom migration that copies `exercises` → `workout_exercises` (with `exerciseId = null`, `orderIndex = 0`) before dropping `exercises`.

---

## 7. Indexes (recommended)

- `WorkoutPlan.userId`
- `PlanWorkout.workoutPlanId`, `(workoutPlanId, weekNumber, dayOfWeek)`
- `PlanExercise.planWorkoutId`
- `Workout.userId`, `Workout.workoutPlanId`, `Workout.planWorkoutId`
- `WorkoutExercise.workoutId`
- `WorkoutLog.userId`, `WorkoutLog.workoutId`, `WorkoutLog.startedAt`
- `WorkoutLogEntry.workoutLogId`
- `CompletedSet.workoutLogEntryId`

These are reflected in the Prisma schema where appropriate.
