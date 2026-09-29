import cron from "node-cron";
import { prisma } from "../config/prisma";
import { Prisma } from "../../generated/prisma/client.ts";
import type { NotificationType } from "../../generated/prisma/enums.ts";
import { addUtcDays, getExpireBaseDate } from "@/jobs/expireRequests.util";
import { createManyNotifications } from "@/modules/notification/notification.service";
import {
  enqueueNotificationPublish,
  runAfterCommitPublish,
} from "@/modules/notification/notification.publish";

/** Read Committed에서는 동시에 읽으면 둘 다 기존 알림을 못 볼 수 있어 Serializable로 재시도합니다 */
const NOTIFY_MAX_RETRIES = 3;

function movingReminderType(movingDate: Date, today: Date): NotificationType {
  return movingDate.getTime() === today.getTime() ? "MOVING_DAY" : "MOVING_DAY_BEFORE";
}

/**
 * 이사 전날·당일 알림 — 매일 09:00 (KST). 고객과 확정 기사님이 함께 받습니다.
 *
 * 확정 기사님이 있는(ASSIGNED) 요청만 대상입니다. 견적을 확정하지 않은 채 이사일이 된
 * 요청은 알릴 기사님이 없고, 다음 자정 expireRequests가 EXPIRED로 정리합니다.
 *
 * expireRequests(00:00)는 movingDate가 "지난" 요청을 처리하므로 당일 09:00 대상과 겹치지 않습니다.
 *
 * 멱등: type을 전날/당일로 나눠 이미 받은 수신자만 빼고 넣습니다.
 * 동시에 두 번 돌면 Serializable + partial unique가 한 쪽만 남깁니다.
 */
export async function notifyMovingDay(): Promise<void> {
  const today = getExpireBaseDate();
  const tomorrow = addUtcDays(today, 1);

  const targets = await prisma.quotationRequest.findMany({
    where: {
      movingDate: { in: [today, tomorrow] },
      quotationStatus: "ASSIGNED",
    },
    select: {
      id: true,
      userId: true,
      movingDate: true,
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
    const type = movingReminderType(target.movingDate, today);
    const moverId = target.estimates[0]?.moverId;
    const recipients = moverId === undefined ? [target.userId] : [target.userId, moverId];

    try {
      let notifiedUserIds: number[] | undefined;

      for (let attempt = 1; attempt <= NOTIFY_MAX_RETRIES; attempt++) {
        try {
          notifiedUserIds = await runAfterCommitPublish(() =>
            prisma.$transaction(
              async (tx) => {
                const existing = await tx.notification.findMany({
                  where: { quotationRequestId: target.id, type },
                  select: { userId: true },
                });
                const notified = new Set(existing.map((row) => row.userId));
                const pending = recipients.filter((userId) => !notified.has(userId));

                await createManyNotifications(
                  tx,
                  pending.map((userId) => ({
                    userId,
                    type,
                    quotationRequestId: target.id,
                  }))
                );
                enqueueNotificationPublish(pending, type);

                return pending;
              },
              { isolationLevel: "Serializable" }
            )
          );
          break;
        } catch (error) {
          const retryable =
            error instanceof Prisma.PrismaClientKnownRequestError &&
            (error.code === "P2034" || error.code === "P2002");
          if (retryable && attempt < NOTIFY_MAX_RETRIES) continue;
          throw error;
        }
      }

      if (!notifiedUserIds) continue;

      created += notifiedUserIds.length;
      if (notifiedUserIds.length < recipients.length) skipped += 1;
    } catch (error) {
      console.error(`[notifyMovingDay] 요청 ${target.id} 처리 실패`, error);
    }
  }

  console.log(
    `[notifyMovingDay] 대상 ${targets.length}건 / 알림 ${created}건 생성` +
      (skipped > 0 ? ` / 이미 보낸 요청 ${skipped}건` : "")
  );
}

export function scheduleMovingDayNotify() {
  cron.schedule("0 9 * * *", notifyMovingDay, { timezone: "Asia/Seoul" });
}
