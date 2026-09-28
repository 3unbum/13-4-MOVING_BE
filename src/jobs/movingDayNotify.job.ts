import cron from "node-cron";
import { prisma } from "../config/prisma";
import { getExpireBaseDate } from "@/jobs/expireRequests.util";
import { createManyNotifications } from "@/modules/notification/notification.service";
import {
  enqueueNotificationPublish,
  runAfterCommitPublish,
} from "@/modules/notification/notification.publish";

/**
 * 이사 당일 알림 — 매일 09:00 (KST). 고객과 확정 기사님이 함께 받습니다.
 *
 * 확정 기사님이 있는(ASSIGNED) 요청만 대상입니다. 견적을 확정하지 않은 채 이사일이 된
 * 요청은 알릴 기사님이 없고, 다음 자정 expireRequests가 EXPIRED로 정리합니다.
 *
 * expireRequests(00:00)는 movingDate가 "지난" 요청을 처리하므로 대상이 겹치지 않습니다.
 *
 * 여러 번 실행해도 안전합니다(멱등) — 요청별로 이미 만든 수신자를 빼고 만듭니다.
 * ⚠️ 전날(D-1) 알림을 추가하면 "요청당 MOVING_DAY 1회" 전제가 깨져 이 방식으로는
 * 중복을 막을 수 없습니다. 그때는 dedupeKey 같은 유니크 키가 필요합니다.
 */
export async function notifyMovingDay(): Promise<void> {
  // movingDate는 @db.Date라 UTC 자정으로 저장됩니다. 기준일도 같은 형태로 맞춥니다.
  const today = getExpireBaseDate();

  const targets = await prisma.quotationRequest.findMany({
    where: { movingDate: today, quotationStatus: "ASSIGNED" },
    select: {
      id: true,
      userId: true,
      // 확정 견적은 요청당 1건입니다 (estimate.repository.confirm이 조건부 갱신으로 보장)
      estimates: {
        where: { estimateStatus: "CONFIRMED" },
        select: { moverId: true },
        take: 1,
      },
    },
  });

  if (targets.length === 0) return;

  let created = 0;
  let skipped = 0;

  for (const target of targets) {
    const moverId = target.estimates[0]?.moverId;
    // ASSIGNED인데 확정 견적이 없으면 데이터가 어긋난 상태입니다. 고객에게만 보내고 넘어갑니다.
    const recipients = moverId === undefined ? [target.userId] : [target.userId, moverId];

    try {
      // 중복 확인과 생성을 한 트랜잭션에 묶어, 재실행이 겹쳐도 같은 수신자에게 두 번 가지 않게 합니다
      const notifiedUserIds = await runAfterCommitPublish(() =>
        prisma.$transaction(async (tx) => {
          const existing = await tx.notification.findMany({
            where: { quotationRequestId: target.id, type: "MOVING_DAY" },
            select: { userId: true },
          });
          const notified = new Set(existing.map((row) => row.userId));
          const pending = recipients.filter((userId) => !notified.has(userId));

          await createManyNotifications(
            tx,
            pending.map((userId) => ({
              userId,
              type: "MOVING_DAY" as const,
              quotationRequestId: target.id,
            }))
          );
          enqueueNotificationPublish(pending, "MOVING_DAY");

          return pending;
        })
      );

      created += notifiedUserIds.length;
      if (notifiedUserIds.length < recipients.length) skipped += 1;
    } catch (error) {
      // 한 건이 실패해도 나머지는 계속 처리합니다 (expireRequests와 같은 방식)
      console.error(`[notifyMovingDay] 요청 ${target.id} 처리 실패`, error);
    }
  }

  console.log(
    `[notifyMovingDay] 대상 ${targets.length}건 / 알림 ${created}건 생성` +
      (skipped > 0 ? ` / 이미 보낸 요청 ${skipped}건` : "")
  );
}

export function scheduleMovingDayNotify() {
  // 매일 09:00 (KST) — 이사 당일 아침에 받도록
  cron.schedule("0 9 * * *", notifyMovingDay, { timezone: "Asia/Seoul" });
}
