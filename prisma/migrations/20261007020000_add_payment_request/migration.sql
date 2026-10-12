-- 결제 요청 알림.
-- ADD VALUE와 같은 트랜잭션에서는 새 enum 리터럴을 쓸 수 없어, 이 마이그레이션에서는 값을 쓰지 않습니다.
ALTER TYPE "notification_type" ADD VALUE 'PAYMENT_REQUEST';

-- AlterTable
ALTER TABLE "estimate" ADD COLUMN "payment_requested_at" TIMESTAMP(3);
