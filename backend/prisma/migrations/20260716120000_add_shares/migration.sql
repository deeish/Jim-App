-- CreateTable
CREATE TABLE "shares" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "senderName" TEXT,
    "planId" TEXT,
    "workoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_redemptions" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clonedPlanId" TEXT,
    "clonedWorkoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shares_code_key" ON "shares"("code");

-- CreateIndex
CREATE INDEX "shares_ownerUserId_idx" ON "shares"("ownerUserId");

-- CreateIndex
CREATE INDEX "shares_planId_idx" ON "shares"("planId");

-- CreateIndex
CREATE INDEX "shares_workoutId_idx" ON "shares"("workoutId");

-- CreateIndex
CREATE INDEX "share_redemptions_userId_idx" ON "share_redemptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "share_redemptions_shareId_userId_key" ON "share_redemptions"("shareId", "userId");

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_planId_fkey" FOREIGN KEY ("planId") REFERENCES "workout_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shares" ADD CONSTRAINT "shares_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "workouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_redemptions" ADD CONSTRAINT "share_redemptions_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_redemptions" ADD CONSTRAINT "share_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
