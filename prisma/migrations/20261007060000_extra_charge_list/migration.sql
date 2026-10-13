-- 추가 금액을 견적당 1건(컬럼)에서 여러 건(테이블)으로 바꿉니다.
-- CreateTable
CREATE TABLE "estimate_extra_charge" (
    "id" SERIAL NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "extra_charge_status" NOT NULL DEFAULT 'PROPOSED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "estimate_extra_charge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimate_extra_charge_estimate_id_idx" ON "estimate_extra_charge"("estimate_id");

-- AddForeignKey
ALTER TABLE "estimate_extra_charge" ADD CONSTRAINT "estimate_extra_charge_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 1건짜리 요청을 옮깁니다
INSERT INTO "estimate_extra_charge" ("estimate_id", "amount", "reason", "status", "created_at", "responded_at")
SELECT "id", "extra_amount", "extra_reason", "extra_status", "updated_at",
       CASE WHEN "extra_status" = 'PROPOSED' THEN NULL ELSE "updated_at" END
FROM "estimate"
WHERE "extra_status" IS NOT NULL AND "extra_amount" IS NOT NULL AND "extra_reason" IS NOT NULL;

-- AlterTable
ALTER TABLE "estimate" DROP COLUMN "extra_amount",
DROP COLUMN "extra_reason",
DROP COLUMN "extra_status";
