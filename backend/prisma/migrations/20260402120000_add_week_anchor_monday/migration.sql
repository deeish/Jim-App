-- AlterTable
ALTER TABLE "workout_plans" ADD COLUMN IF NOT EXISTS "week_anchor_monday" DATE;

-- Backfill: ISO week Monday containing createdAt (Prisma column name is camelCase)
UPDATE "workout_plans"
SET "week_anchor_monday" = (DATE_TRUNC('week', "createdAt" AT TIME ZONE 'UTC'))::date
WHERE "week_anchor_monday" IS NULL;
