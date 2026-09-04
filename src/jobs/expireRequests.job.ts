import cron from "node-cron";
import { prisma } from "../config/prisma";
import { getExpireBaseDate } from "@/jobs/expireRequests.util";

/**
 * 이사일 경과 처리 — 매일 자정.
 *
 * ⚠️ MVP 필수. 이 배치가 활성 견적 요청을 해제하는 유일한 경로입니다.
 * 없으면 유저가 두 번째 견적 요청을 영원히 할 수 없고,
 * "작성 가능한 리뷰"도 생성되지 않습니다.
 *
 * 처리 내용:
 *   1. moving_date가 지난 quotation_request 조회
 *   2. 확정 견적 있음 → COMPLETED / 없음 → EXPIRED
 *   3. 해당 estimate → COMPLETED
 *   4. 확정 견적에 대해 review를 PENDING으로 생성
 *
 * confirmed_count는 견적 확정 시점에 이미 증가하므로 여기서 건드리지 않습니다.
 * 여러 번 실행해도 안전합니다(멱등) - 상태 조건부 갱신 + review는 estimate_id 유니크.
 */
export async function expireRequests(): Promise<void> {
  const today = getExpireBaseDate();

  const targets = await prisma.quotationRequest.findMany({
    where: {
      movingDate: { lt: today },
      quotationStatus: { in: ["PENDING", "ASSIGNED"] },
    },
    select: {
      id: true,
      userId: true,
      estimates: {
        where: { estimateStatus: "CONFIRMED" },
        select: { id: true },
      },
    },
  });

  if (targets.length === 0) return;

  let completed = 0;
  let expired = 0;

  for (const target of targets) {
    const confirmed = target.estimates[0];

    try {
      await prisma.$transaction(async (tx) => {
        if (!confirmed) {
          // 견적을 못 받았거나 확정하지 않은 채 이사일이 지난 요청
          await tx.quotationRequest.update({
            where: { id: target.id },
            data: { quotationStatus: "EXPIRED" },
          });
          expired += 1;
          return;
        }

        await tx.quotationRequest.update({
          where: { id: target.id },
          data: { quotationStatus: "COMPLETED" },
        });

        await tx.estimate.update({
          where: { id: confirmed.id },
          data: { estimateStatus: "COMPLETED" },
        });

        // 리뷰는 이사 완료 시점에 PENDING으로 미리 만들어 둡니다.
        // 재실행 시 중복 생성되지 않도록 estimate_id 유니크를 이용합니다.
        await tx.review.upsert({
          where: { estimateId: confirmed.id },
          create: {
            estimateId: confirmed.id,
            customerId: target.userId,
            status: "PENDING",
          },
          update: {},
        });

        completed += 1;
      });
    } catch (error) {
      // 한 건이 실패해도 나머지는 계속 처리합니다.
      console.error(`[expireRequests] 오청 ${target.id} 처리 실패`, error);
    }
  }

  console.log(`[expireRequests] 완료 ${completed}건 / 만료 ${expired}건`);
}

export function scheduleExpireRequests() {
  // 매일 00:00 (KST)
  cron.schedule("0 0 * * *", expireRequests, { timezone: "Asia/Seoul" });
}
