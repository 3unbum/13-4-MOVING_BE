import cron from "node-cron";
import { prisma } from "../config/prisma";
import { depositDueWhere } from "@/modules/estimate/estimate.payment";
import { createManyNotifications } from "@/modules/notification/notification.service";
import {
  enqueueNotificationPublish,
  runAfterCommitPublish,
} from "@/modules/notification/notification.publish";

/**
 * 선수금 기한 만료 처리 — 매시간.
 *
 * 확정 후 48시간(이사일이 임박하면 이사일 0시) 안에 선수금을 못 낸 견적의 확정을 취소합니다.
 *
 * 처리 내용 (견적 한 건당 한 트랜잭션):
 *   1. 견적 CONFIRMED → PENDING, 선수금 필드 초기화 (고객이 다른 견적을 다시 확정할 수 있게)
 *   2. 견적 요청 ASSIGNED → PENDING
 *   3. 기사님 confirmedCount -1 (확정 때 올렸던 것을 되돌림)
 *   4. 확정할 때 열린 채팅방 삭제 (메시지·알림은 함께 지워집니다)
 *   5. 고객·기사님 양쪽에 알림 (DEPOSIT_EXPIRED)
 *
 * 여러 번 실행해도 안전합니다(멱등) — 같은 조건으로 조건부 갱신하고 count로 확인합니다.
 */
export async function expireDeposits(now: Date = new Date()): Promise<void> {
  const dueWhere = { ...depositDueWhere, depositDueAt: { lt: now } };

  const targets = await prisma.estimate.findMany({
    where: dueWhere,
    select: {
      id: true,
      moverId: true,
      quotationRequestId: true,
      quotationRequest: { select: { userId: true } },
    },
  });

  if (targets.length === 0) return;

  let canceled = 0;
  let skipped = 0;

  for (const target of targets) {
    try {
      // 한 건 단위로 감싸야 롤백된 시도의 SSE가 나가지 않습니다
      await runAfterCommitPublish(() =>
        prisma.$transaction(async (tx) => {
          // 위 findMany 이후 선수금이 결제됐거나 다른 처리가 있었을 수 있어 같은 조건으로 다시 갱신합니다
          const update = await tx.estimate.updateMany({
            where: { id: target.id, ...dueWhere },
            data: {
              estimateStatus: "PENDING",
              depositAmount: null,
              depositDueAt: null,
              paymentRequestedAt: null,
            },
          });
          if (update.count !== 1) {
            skipped += 1;
            return;
          }

          await tx.quotationRequest.updateMany({
            where: { id: target.quotationRequestId, quotationStatus: "ASSIGNED" },
            data: { quotationStatus: "PENDING" },
          });
          await tx.moverProfile.update({
            where: { userId: target.moverId },
            data: { confirmedCount: { decrement: 1 } },
          });
          const customerId = target.quotationRequest.userId;
          await createManyNotifications(tx, [
            { userId: customerId, estimateId: target.id, type: "DEPOSIT_EXPIRED" },
            { userId: target.moverId, estimateId: target.id, type: "DEPOSIT_EXPIRED" },
          ]);
          enqueueNotificationPublish([customerId, target.moverId], "DEPOSIT_EXPIRED");

          canceled += 1;
        })
      );
    } catch (error) {
      // 한 건이 실패해도 나머지는 계속 처리합니다.
      console.error(`[expireDeposits] 견적 ${target.id} 처리 실패`, error);
    }
  }

  console.log(
    `[expireDeposits] 확정 취소 ${canceled}건` + (skipped > 0 ? ` / 건너뜀 ${skipped}건` : "")
  );
}

export function scheduleExpireDeposits() {
  // 매시 정각 (KST)
  cron.schedule("0 * * * *", () => void expireDeposits(), { timezone: "Asia/Seoul" });
}
