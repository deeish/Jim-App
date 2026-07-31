-- Progress/stats read paths. Index-only: no columns, no constraints, no data
-- rewrite, so this is safe to deploy ahead of any client change.
--
-- Plain CREATE INDEX (not CONCURRENTLY): Prisma wraps each migration in a
-- transaction and CONCURRENTLY cannot run inside one. It takes a SHARE lock —
-- reads keep working, writes block for the build. Fine at current table sizes;
-- revisit if workout_logs ever grows large enough for that pause to matter.

-- CreateIndex
CREATE INDEX "workout_logs_userId_startedAt_idx" ON "workout_logs"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "workout_log_entries_exerciseId_idx" ON "workout_log_entries"("exerciseId");
