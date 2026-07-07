-- CreateTable
CREATE TABLE "body_weight_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weightLb" DOUBLE PRECISION NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL,
    "dayKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_weight_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "body_weight_entries_userId_loggedAt_idx" ON "body_weight_entries"("userId", "loggedAt");

-- CreateIndex
CREATE UNIQUE INDEX "body_weight_entries_userId_dayKey_key" ON "body_weight_entries"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "body_weight_entries" ADD CONSTRAINT "body_weight_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
