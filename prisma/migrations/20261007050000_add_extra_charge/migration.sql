-- 추가 금액 알림. ADD VALUE와 같은 트랜잭션에서는 새 enum 리터럴을 쓸 수 없어, 이 마이그레이션에서는 값을 쓰지 않습니다.
ALTER TYPE "notification_type" ADD VALUE 'EXTRA_CHARGE_PROPOSED';
ALTER TYPE "notification_type" ADD VALUE 'EXTRA_CHARGE_RESPONDED';

-- CreateEnum
CREATE TYPE "extra_charge_status" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- AlterTable
-- 모두 NULL로 시작합니다. 기존 견적은 추가 금액 요청이 없는 상태입니다.
ALTER TABLE "estimate" ADD COLUMN "extra_amount" INTEGER,
ADD COLUMN "extra_reason" TEXT,
ADD COLUMN "extra_status" "extra_charge_status";
