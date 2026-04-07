-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "week_anchor_monday" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_workouts" (
    "id" TEXT NOT NULL,
    "workoutPlanId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detailLine" TEXT,
    "type" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "intensity" TEXT,
    "orderInDay" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_exercises" (
    "id" TEXT NOT NULL,
    "planWorkoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "name" TEXT,
    "sets" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION,
    "notes" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "day" TEXT,
    "estimatedDuration" INTEGER,
    "focus" TEXT,
    "reasoning" TEXT,
    "warmUp" TEXT,
    "coolDown" TEXT,
    "workoutPlanId" TEXT,
    "planWorkoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_workouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_exercises" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_exercises" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "exerciseId" TEXT,
    "name" TEXT NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION,
    "notes" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "totalTimeSeconds" INTEGER,
    "totalSets" INTEGER,
    "totalVolume" DOUBLE PRECISION,
    "overallNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_log_entries" (
    "id" TEXT NOT NULL,
    "workoutLogId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "name" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completed_sets" (
    "id" TEXT NOT NULL,
    "workoutLogEntryId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION,
    "rpe" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "completed_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_plans_userId_idx" ON "workout_plans"("userId");

-- CreateIndex
CREATE INDEX "plan_workouts_workoutPlanId_idx" ON "plan_workouts"("workoutPlanId");

-- CreateIndex
CREATE INDEX "plan_workouts_workoutPlanId_weekNumber_dayOfWeek_idx" ON "plan_workouts"("workoutPlanId", "weekNumber", "dayOfWeek");

-- CreateIndex
CREATE INDEX "plan_exercises_planWorkoutId_idx" ON "plan_exercises"("planWorkoutId");

-- CreateIndex
CREATE INDEX "workouts_userId_idx" ON "workouts"("userId");

-- CreateIndex
CREATE INDEX "workouts_workoutPlanId_idx" ON "workouts"("workoutPlanId");

-- CreateIndex
CREATE INDEX "workouts_planWorkoutId_idx" ON "workouts"("planWorkoutId");

-- CreateIndex
CREATE INDEX "saved_workouts_userId_idx" ON "saved_workouts"("userId");

-- CreateIndex
CREATE INDEX "saved_workouts_workoutId_idx" ON "saved_workouts"("workoutId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_workouts_userId_workoutId_key" ON "saved_workouts"("userId", "workoutId");

-- CreateIndex
CREATE INDEX "saved_exercises_userId_idx" ON "saved_exercises"("userId");

-- CreateIndex
CREATE INDEX "saved_exercises_exerciseId_idx" ON "saved_exercises"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_exercises_userId_exerciseId_key" ON "saved_exercises"("userId", "exerciseId");

-- CreateIndex
CREATE INDEX "workout_exercises_workoutId_idx" ON "workout_exercises"("workoutId");

-- CreateIndex
CREATE INDEX "workout_logs_userId_idx" ON "workout_logs"("userId");

-- CreateIndex
CREATE INDEX "workout_logs_workoutId_idx" ON "workout_logs"("workoutId");

-- CreateIndex
CREATE INDEX "workout_logs_startedAt_idx" ON "workout_logs"("startedAt");

-- CreateIndex
CREATE INDEX "workout_log_entries_workoutLogId_idx" ON "workout_log_entries"("workoutLogId");

-- CreateIndex
CREATE INDEX "completed_sets_workoutLogEntryId_idx" ON "completed_sets"("workoutLogEntryId");

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_workouts" ADD CONSTRAINT "plan_workouts_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_exercises" ADD CONSTRAINT "plan_exercises_planWorkoutId_fkey" FOREIGN KEY ("planWorkoutId") REFERENCES "plan_workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "workout_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_planWorkoutId_fkey" FOREIGN KEY ("planWorkoutId") REFERENCES "plan_workouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_workouts" ADD CONSTRAINT "saved_workouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_workouts" ADD CONSTRAINT "saved_workouts_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_exercises" ADD CONSTRAINT "saved_exercises_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_log_entries" ADD CONSTRAINT "workout_log_entries_workoutLogId_fkey" FOREIGN KEY ("workoutLogId") REFERENCES "workout_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completed_sets" ADD CONSTRAINT "completed_sets_workoutLogEntryId_fkey" FOREIGN KEY ("workoutLogEntryId") REFERENCES "workout_log_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
