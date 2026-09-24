-- Recovery corrections (2026-09-24): "Still sore" / "Feeling fine" per body-map
-- region, layered over the recovery estimate. One live note per user+region.
CREATE TABLE "muscle_recovery_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "muscle_recovery_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "muscle_recovery_notes_userId_region_key" ON "muscle_recovery_notes"("userId", "region");
CREATE INDEX "muscle_recovery_notes_userId_idx" ON "muscle_recovery_notes"("userId");

ALTER TABLE "muscle_recovery_notes" ADD CONSTRAINT "muscle_recovery_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
