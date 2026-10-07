-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('UNPAID', 'PAID');

-- AlterTable
-- 기존 행은 모두 UNPAID. 이미 COMPLETED인 견적도 결제 대기로 시작합니다.
ALTER TABLE "estimate" ADD COLUMN "payment_status" "payment_status" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "paid_at" TIMESTAMP(3);
