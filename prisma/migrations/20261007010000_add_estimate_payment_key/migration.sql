-- AlterTable
ALTER TABLE "estimate" ADD COLUMN "payment_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "estimate_payment_key_key" ON "estimate"("payment_key");
