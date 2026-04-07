-- CreateTable
CREATE TABLE "saved_workouts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_workouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_workouts_userId_workoutId_key" ON "saved_workouts"("userId", "workoutId");

-- CreateIndex
CREATE INDEX "saved_workouts_userId_idx" ON "saved_workouts"("userId");

-- CreateIndex
CREATE INDEX "saved_workouts_workoutId_idx" ON "saved_workouts"("workoutId");

-- AddForeignKey
ALTER TABLE "saved_workouts" ADD CONSTRAINT "saved_workouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_workouts" ADD CONSTRAINT "saved_workouts_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
