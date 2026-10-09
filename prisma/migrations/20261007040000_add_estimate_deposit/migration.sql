-- 선수금 알림. ADD VALUE와 같은 트랜잭션에서는 새 enum 리터럴을 쓸 수 없어, 이 마이그레이션에서는 값을 쓰지 않습니다.
ALTER TYPE "notification_type" ADD VALUE 'DEPOSIT_PAID';
ALTER TYPE "notification_type" ADD VALUE 'DEPOSIT_EXPIRED';

-- AlterTable
-- 선수금 컬럼은 모두 NULL로 시작합니다. 이미 확정된 옛 견적은 선수금 없이 기존 흐름(이사 완료 후 전액 결제)을 따릅니다.
ALTER TABLE "estimate" ADD COLUMN "deposit_amount" INTEGER,
ADD COLUMN "deposit_due_at" TIMESTAMP(3),
ADD COLUMN "deposit_paid_at" TIMESTAMP(3),
ADD COLUMN "deposit_payment_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "estimate_deposit_payment_key_key" ON "estimate"("deposit_payment_key");
