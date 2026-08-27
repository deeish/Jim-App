-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarId" TEXT;

-- CreateTable
CREATE TABLE "crews" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_members" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_kudos" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "eventRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_kudos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crews_code_key" ON "crews"("code");

-- CreateIndex
CREATE UNIQUE INDEX "crew_members_userId_key" ON "crew_members"("userId");

-- CreateIndex
CREATE INDEX "crew_members_crewId_idx" ON "crew_members"("crewId");

-- CreateIndex
CREATE INDEX "crew_kudos_crewId_idx" ON "crew_kudos"("crewId");

-- CreateIndex
CREATE INDEX "crew_kudos_toUserId_idx" ON "crew_kudos"("toUserId");

-- CreateIndex
CREATE UNIQUE INDEX "crew_kudos_fromUserId_toUserId_eventRef_key" ON "crew_kudos"("fromUserId", "toUserId", "eventRef");

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_kudos" ADD CONSTRAINT "crew_kudos_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_kudos" ADD CONSTRAINT "crew_kudos_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crew_kudos" ADD CONSTRAINT "crew_kudos_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

