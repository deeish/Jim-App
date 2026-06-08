-- Role-aware rep prescription: add a stored rep range, an explicit duration for
-- time/cardio rows, and the prescription type to plan + workout exercises.
-- All columns are nullable/additive; existing rows keep their `reps` scalar
-- (which now also serves as the working default = repsMin when a range is set).

ALTER TABLE "plan_exercises" ADD COLUMN "repsMin" INTEGER;
ALTER TABLE "plan_exercises" ADD COLUMN "repsMax" INTEGER;
ALTER TABLE "plan_exercises" ADD COLUMN "durationSeconds" INTEGER;
ALTER TABLE "plan_exercises" ADD COLUMN "prescriptionType" TEXT;

ALTER TABLE "workout_exercises" ADD COLUMN "repsMin" INTEGER;
ALTER TABLE "workout_exercises" ADD COLUMN "repsMax" INTEGER;
ALTER TABLE "workout_exercises" ADD COLUMN "durationSeconds" INTEGER;
ALTER TABLE "workout_exercises" ADD COLUMN "prescriptionType" TEXT;
