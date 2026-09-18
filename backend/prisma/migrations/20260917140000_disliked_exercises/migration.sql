-- Exercises a user never wants to see (2026-09-17): the generator, every
-- repair and swap, and the replacement picker exclude these ids.
CREATE TABLE "disliked_exercises" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disliked_exercises_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "disliked_exercises_userId_exerciseId_key" ON "disliked_exercises"("userId", "exerciseId");
CREATE INDEX "disliked_exercises_userId_idx" ON "disliked_exercises"("userId");
CREATE INDEX "disliked_exercises_exerciseId_idx" ON "disliked_exercises"("exerciseId");

ALTER TABLE "disliked_exercises" ADD CONSTRAINT "disliked_exercises_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
