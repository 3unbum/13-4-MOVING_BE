import cron from "node-cron";
import { prisma } from "../config/prisma";
import { getExpireBaseDate } from "./expireRequests.util";
import {
  createNotification,
  runAfterCommitPublish,
} from "../modules/notification/notification.service";

/**
 * 이사 당일 알림 — 매일 09:00 KST.
 *
 * 대상은 오늘 이사하는 ASSIGNED 요청입니다.
 * expire 배치는 자정에 movingDate < 오늘인 건만 COMPLETED로 바꾸므로,
 * 당일 아침에는 아직 ASSIGNED입니다.
 *
 * 같은 요청·수신자에 MOVING_DAY가 있으면 건너뜁니다 (재실행 안전).
 */
export async function notifyMovingDay(now: Date = new Date()): Promise<void> {
  const today = getExpireBaseDate(now);

  const requests = await prisma.quotationRequest.findMany({
    where: { movingDate: today, quotationStatus: "ASSIGNED" },
    select: {
      id: true,
      userId: true,
      estimates: {
        where: { estimateStatus: "CONFIRMED" },
        select: { moverId: true },
        take: 1,
      },
    },
  });

  if (requests.length === 0) return;

  let created = 0;
  let skipped = 0;

  for (const request of requests) {
    const moverId = request.estimates[0]?.moverId;
    const recipientIds = moverId ? [request.userId, moverId] : [request.userId];

    try {
      await runAfterCommitPublish(() =>
        prisma.$transaction(async (tx) => {
          for (const userId of recipientIds) {
            const exists = await tx.notification.findFirst({
              where: { userId, type: "MOVING_DAY", quotationRequestId: request.id },
              select: { id: true },
            });
            if (exists) {
              skipped += 1;
              continue;
            }

            await createNotification(tx, {
              userId,
              type: "MOVING_DAY",
              quotationRequestId: request.id,
            });
            created += 1;
          }
        })
      );
    } catch (error) {
      console.error(`[notifyMovingDay] 요청 ${request.id} 처리 실패`, error);
    }
  }

  console.log(
    `[notifyMovingDay] 생성 ${created}건` + (skipped > 0 ? ` / 건너뜀 ${skipped}건` : "")
  );
}

export function scheduleMovingDayNotify() {
  cron.schedule("0 9 * * *", () => notifyMovingDay(), { timezone: "Asia/Seoul" });
}
