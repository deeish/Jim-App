-- AlterTable: add isActive to workout_plans
ALTER TABLE "workout_plans" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;

-- Deduplicate workouts on (planWorkoutId, userId) before adding unique constraint.
-- Keeps the earliest-created row per pair and deletes any duplicates caused by
-- the race condition this constraint is designed to prevent going forward.
DELETE FROM "workouts" w
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "planWorkoutId", "userId"
           ORDER BY "createdAt" ASC
         ) AS rn
  FROM "workouts"
  WHERE "planWorkoutId" IS NOT NULL
    AND "userId" IS NOT NULL
) ranked
WHERE w.id = ranked.id
  AND ranked.rn > 1;

-- CreateIndex: unique constraint on (planWorkoutId, userId)
CREATE UNIQUE INDEX "workouts_planWorkoutId_userId_key" ON "workouts"("planWorkoutId", "userId");
