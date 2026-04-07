-- CreateTable
CREATE TABLE "saved_exercises" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_exercises_userId_exerciseId_key" ON "saved_exercises"("userId", "exerciseId");

-- CreateIndex
CREATE INDEX "saved_exercises_userId_idx" ON "saved_exercises"("userId");

-- CreateIndex
CREATE INDEX "saved_exercises_exerciseId_idx" ON "saved_exercises"("exerciseId");

-- AddForeignKey
ALTER TABLE "saved_exercises" ADD CONSTRAINT "saved_exercises_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
