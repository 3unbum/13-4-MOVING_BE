-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('UNPAID', 'PAID');

-- AlterTable
ALTER TABLE "estimate" ADD COLUMN "payment_status" "payment_status" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "paid_at" TIMESTAMP(3);

-- 이미 이사가 끝난 견적은 결제도 끝난 것으로 봅니다. (리뷰 작성 조건이 PAID를 요구)
UPDATE "estimate" SET "payment_status" = 'PAID', "paid_at" = "updated_at"
WHERE "estimate_status" = 'COMPLETED';
