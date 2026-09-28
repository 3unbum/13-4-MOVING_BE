import { prisma, type PrismaTransaction } from "../../config/prisma";
import { AppError } from "../../common/errors/AppError";
import type { NotificationType } from "../../../generated/prisma/enums.ts";
import { publishNotification } from "./notification.hub";
import { toNotificationItem } from "./notification.mapper";
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

const DEFAULT_LIMIT = 10;

/**
 * 알림 생성 — 견적 요청/발송/확정 트랜잭션 안에서 호출됩니다.
 *
 * 시그니처는 확정된 것이므로 변경하지 마세요.
 * 문구는 FE가 type+payload로 조립합니다. SSE는 커밋 직후 같은 유저 연결에만 푸시합니다.
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

  const item = toNotificationItem(created);
  // 트랜잭션 콜백이 끝난 뒤에 보냅니다. 롤백되면 목록 API가 진실입니다.
  setImmediate(() => publishNotification(created.userId, item));
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
