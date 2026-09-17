-- Post-session check-in (Tier 4a of the 2026-09-16 plan).
ALTER TABLE "workout_logs" ADD COLUMN "effort" INTEGER;
ALTER TABLE "workout_logs" ADD COLUMN "soreness" INTEGER;
ALTER TABLE "workout_logs" ADD COLUMN "jointPain" INTEGER;
ALTER TABLE "workout_logs" ADD COLUMN "checkInAppliedAt" TIMESTAMP(3);
