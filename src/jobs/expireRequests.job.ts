import cron from "node-cron";
import { prisma } from "../config/prisma";
import { getExpireBaseDate } from "@/jobs/expireRequests.util";

/**
 * 이사일 경과 처리 — 매일 자정.
 *
 * ⚠️ MVP 필수. 이 배치가 활성 견적 요청을 해제하는 유일한 경로입니다.
 * 없으면 유저가 두 번째 견적 요청을 영원히 할 수 없습니다.
 *
 * 처리 내용:
 *   1. moving_date가 지난 quotation_request 조회
 *   2. 확정 견적 있음 → COMPLETED / 없음 → EXPIRED
 *   3. 해당 estimate → COMPLETED
 *
 * 리뷰(PENDING)는 여기서 만들지 않습니다 — 고객이 잔금을 결제하면 estimate.repository.pay가 만듭니다.
 *
 * confirmed_count는 견적 확정 시점에 이미 증가하므로 여기서 건드리지 않습니다.
 * 여러 번 실행해도 안전합니다(멱등) - 상태 조건부 갱신.
 */
export async function expireRequests(): Promise<void> {
  const today = getExpireBaseDate();

  // 대상 id만 추립니다. 확정 견적 조회는 경쟁 조건을 피하려고 트랜잭션 안에서 다시 합니다.
  const targets = await prisma.quotationRequest.findMany({
    where: {
      movingDate: { lt: today },
      quotationStatus: { in: ["PENDING", "ASSIGNED"] },
    },
    select: { id: true, userId: true },
  });

  if (targets.length === 0) return;

  let completed = 0;
  let expired = 0;
  let skipped = 0;

  for (const target of targets) {
    try {
      await prisma.$transaction(async (tx) => {
        // 위 findMany 이후 유저가 견적을 확정했을 수 있으므로 트랜잭션 안에서 다시 읽습니다.
        // 밖에서 읽은 값을 쓰면 낡은 !confirmed로 EXPIRED 처리돼
        // 견적이 COMPLETED가 되지 않고 review도 생성되지 않습니다.
        const confirmed = await tx.estimate.findFirst({
          // 선수금이 설정됐는데 못 낸 확정은 완료로 보지 않는다 — 선수금 기한 배치(expireDeposits)가
          // 확정을 취소하고, 요청은 PENDING으로 돌아와 다음 실행에서 EXPIRED가 된다.
          // 선수금이 없는 옛 확정(depositAmount NULL)은 그대로 완료 처리한다.
          where: {
            quotationRequestId: target.id,
            estimateStatus: "CONFIRMED",
            OR: [{ depositAmount: null }, { depositPaidAt: { not: null } }],
          },
          select: { id: true },
        });

        if (!confirmed) {
          // 견적을 못 받았거나 확정하지 않은 채 이사일이 지난 요청
          // 조건부 갱신 — 그사이 상태가 바뀌었으면 건너뜁니다 (estimate.repository.confirm과 같은 패턴)
          // ASSIGNED 제외 - 조회 직후 확정된 요청을 EXPIRED로 덮어쓰지 않도록 (은진님 리뷰)
          const expireUpdate = await tx.quotationRequest.updateMany({
            where: { id: target.id, quotationStatus: "PENDING" },
            data: { quotationStatus: "EXPIRED" },
          });
          if (expireUpdate.count !== 1) {
            skipped += 1;
            return;
          }
          expired += 1;
          return;
        }

        const requestUpdate = await tx.quotationRequest.updateMany({
          where: { id: target.id, quotationStatus: { in: ["PENDING", "ASSIGNED"] } },
          data: { quotationStatus: "COMPLETED" },
        });
        if (requestUpdate.count !== 1) {
          skipped += 1;
          return;
        }

        await tx.estimate.updateMany({
          where: { id: confirmed.id, estimateStatus: "CONFIRMED" },
          data: { estimateStatus: "COMPLETED" },
        });

        completed += 1;
      });
    } catch (error) {
      // 한 건이 실패해도 나머지는 계속 처리합니다.
      console.error(`[expireRequests] 요청 ${target.id} 처리 실패`, error);
    }
  }

  console.log(
    `[expireRequests] 완료 ${completed}건 / 만료 ${expired}건` +
      (skipped > 0 ? ` / 건너뜀 ${skipped}건` : "")
  );
}

export function scheduleExpireRequests() {
  // 매일 00:00 (KST)
  cron.schedule("0 0 * * *", expireRequests, { timezone: "Asia/Seoul" });
}
