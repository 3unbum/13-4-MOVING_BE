import { prisma, type PrismaTransaction } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import type { NotificationType } from "../../../generated/prisma/enums.ts";
import { toNotificationItem } from "./notification.mapper";
import { enqueueNotificationPublish } from "./notification.publish";
import { notificationRepository } from "./notification.repository";
import type { ListNotificationsQuery } from "./notification.schema";
import type {
  CreateNotificationParams,
  NotificationDeleteResult,
  NotificationItem,
  NotificationListResult,
  NotificationReadAllResult,
} from "./notification.type";

export type { NotificationType, CreateNotificationParams };
export { runAfterCommitPublish } from "./notification.publish";

const DEFAULT_LIMIT = 10;

/**
 * 알림 생성 — 견적 요청/발송/확정 트랜잭션 안에서 호출됩니다.
 *
 * 시그니처는 확정된 것이므로 변경하지 마세요.
 * DB INSERT만 수행하고, SSE는 runAfterCommitPublish 대기열에 넣습니다.
 * (트랜잭션을 runAfterCommitPublish로 감싸야 커밋 성공 후에만 푸시됩니다.)
 */
export async function createNotification(
  tx: PrismaTransaction,
  params: CreateNotificationParams
): Promise<void> {
  const created = await notificationRepository.create(tx, {
    userId: params.userId,
    type: params.type,
    estimateId: params.estimateId,
    quotationRequestId: params.quotationRequestId,
  });

  enqueueNotificationPublish(created.userId, toNotificationItem(created));
}

export const notificationService = {
  async list(userId: number, query: ListNotificationsQuery): Promise<NotificationListResult> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const rows = await notificationRepository.findManyByUserId(
      prisma,
      userId,
      query.isRead,
      query.cursor,
      limit + 1
    );

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page.map(toNotificationItem),
      nextCursor: hasNext && last ? last.id : null,
      hasNext,
    };
  },

  async read(userId: number, id: number): Promise<NotificationItem> {
    const found = await notificationRepository.findById(prisma, id);
    if (!found) {
      throw AppError.notFound("알림을 찾을 수 없습니다.");
    }
    if (found.userId !== userId) {
      throw AppError.forbidden("본인의 알림만 읽음 처리할 수 있습니다.");
    }

    if (!found.isRead) {
      await notificationRepository.markRead(prisma, id, userId);
    }

    return toNotificationItem({ ...found, isRead: true });
  },

  async readAll(userId: number): Promise<NotificationReadAllResult> {
    const result = await notificationRepository.markAllRead(prisma, userId);
    return { updatedCount: result.count };
  },

  async delete(userId: number, id: number): Promise<NotificationDeleteResult> {
    const found = await notificationRepository.findById(prisma, id);
    if (!found) {
      throw AppError.notFound("알림을 찾을 수 없습니다.");
    }
    if (found.userId !== userId) {
      throw AppError.forbidden("본인의 알림만 삭제할 수 있습니다.");
    }

    return notificationRepository.deleteOwned(prisma, userId, [id]);
  },

  async bulkDelete(userId: number, ids: number[]): Promise<NotificationDeleteResult> {
    const uniqueIds = [...new Set(ids)];
    return notificationRepository.deleteOwned(prisma, userId, uniqueIds);
  },
};
