-- AlterTable
ALTER TABLE "crews" ADD COLUMN     "name" TEXT;

-- CreateTable
CREATE TABLE "skipped_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateIso" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skipped_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skipped_days_userId_idx" ON "skipped_days"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "skipped_days_userId_dateIso_key" ON "skipped_days"("userId", "dateIso");

-- AddForeignKey
ALTER TABLE "skipped_days" ADD CONSTRAINT "skipped_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

