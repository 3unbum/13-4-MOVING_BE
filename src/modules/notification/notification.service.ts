import { AppError } from "../../common/errors/AppError";
import type { PrismaTransaction } from "../../config/prisma";
import type { NotificationType } from "../../../generated/prisma/enums.ts";
import { notificationRepository } from "./notification.repository";
import type { NotificationListQuery } from "./notification.schema";
import type {
  CreateNotificationParams,
  DeletedCountResult,
  NotificationItem,
  NotificationListResult,
  NotificationSummaryResult,
  ReadNotificationResult,
  UpdatedCountResult,
} from "./notification.type";

// 기존 호출부가 이 경로에서 가져다 쓰고 있어 재수출로 유지합니다
export type { CreateNotificationParams, NotificationType };

const DEFAULT_TAKE = 10;

/**
 * 알림 생성.
 *
 * 견적 요청/발송/확정 트랜잭션 "안에서" 호출되므로 tx를 받습니다.
 * 호출부가 이미 여러 곳에 깔려 있어 시그니처는 변경하지 마세요.
 *
 * message는 채우지 않아도 됩니다. 문구는 FE가 type + payload로 조립합니다.
 */
export async function createNotification(
  tx: PrismaTransaction,
  params: CreateNotificationParams
): Promise<void> {
  await notificationRepository.create(params, tx);
}

/**
 * 알림 여러 건을 한 번에 생성합니다.
 *
 * 출발지 지역 기사님 전원에게 보내는 NEW_REQUEST처럼 대상이 N명일 때
 * createNotification을 N번 await하면 트랜잭션 점유가 그만큼 길어집니다.
 */
export async function createManyNotifications(
  tx: PrismaTransaction,
  paramsList: CreateNotificationParams[]
): Promise<void> {
  if (paramsList.length === 0) return;
  await notificationRepository.createMany(paramsList, tx);
}

type NotificationRow = Awaited<ReturnType<typeof notificationRepository.findManyByUserId>>[number];

/**
 * 원본 relation으로 payload를 만듭니다.
 *
 * 원본이 지워졌거나(estimate/quotationRequest가 null) 기사님이 프로필을 지운 행은
 * 문구를 만들 수 없으므로 null을 돌려 목록에서 제외합니다 (review.service와 같은 방식).
 */
function toItem(row: NotificationRow): NotificationItem | null {
  const base = {
    id: row.id,
    isRead: row.isRead,
    createdAt: row.createdAt,
    estimateId: row.estimateId,
    quotationRequestId: row.quotationRequestId,
  };

  switch (row.type) {
    case "NEW_REQUEST": {
      const request = row.quotationRequest;
      if (!request) return null;
      return {
        ...base,
        type: "NEW_REQUEST",
        payload: {
          category: request.category,
          fromRegion: request.fromRegion,
          movingDate: request.movingDate,
        },
      };
    }

    case "NEW_ESTIMATE": {
      const nickName = row.estimate?.mover.moverProfile?.nickName;
      if (!row.estimate || !nickName) return null;
      return {
        ...base,
        type: "NEW_ESTIMATE",
        payload: {
          moverNickName: nickName,
          category: row.estimate.quotationRequest.category,
          price: row.estimate.price,
        },
      };
    }

    case "ESTIMATE_CONFIRMED": {
      const nickName = row.estimate?.mover.moverProfile?.nickName;
      if (!row.estimate || !nickName) return null;
      return {
        ...base,
        type: "ESTIMATE_CONFIRMED",
        payload: {
          moverNickName: nickName,
          customerName: row.estimate.quotationRequest.user.name,
          category: row.estimate.quotationRequest.category,
        },
      };
    }

    case "MOVING_DAY": {
      const request = row.quotationRequest;
      if (!request) return null;
      return {
        ...base,
        type: "MOVING_DAY",
        payload: {
          fromAddress: request.fromAddress,
          toAddress: request.toAddress,
          movingDate: request.movingDate,
        },
      };
    }

    default:
      return null;
  }
}

export const notificationService = {
  async list(userId: number, query: NotificationListQuery): Promise<NotificationListResult> {
    const take = query.take ?? DEFAULT_TAKE;
    // take + 1건을 읽어 다음 페이지 존재 여부를 판정합니다 (리뷰 목록과 같은 방식)
    const isRead = query.isRead === undefined ? undefined : query.isRead === "true";
    const rows = await notificationRepository.findManyByUserId(
      userId,
      query.cursor,
      take + 1,
      isRead
    );
    const hasMore = rows.length > take;
    const items = (hasMore ? rows.slice(0, take) : rows)
      .map(toItem)
      .filter((item): item is NotificationItem => item !== null);

    // nextCursor는 payload 조립 실패로 걸러진 행까지 넘겨야 합니다.
    // 걸러진 items의 마지막 id를 쓰면 제외된 행을 다음 페이지에서 다시 읽습니다.
    const lastRow = hasMore ? rows[take - 1] : undefined;

    return {
      items,
      nextCursor: lastRow?.id ?? null,
      unreadCount: await notificationRepository.countUnread(userId),
    };
  },

  /** 로그인 직후 "내 지역·이사유형의 미확인 견적 요청" 요약 (기사님 전용) */
  async summarize(userId: number): Promise<NotificationSummaryResult> {
    const rows = await notificationRepository.summarizeUnreadNewRequests(userId);

    return {
      items: rows.map((row) => ({
        region: row.region,
        category: row.category,
        count: row.count,
      })),
      totalCount: rows.reduce((sum, row) => sum + row.count, 0),
    };
  },

  async markRead(userId: number, id: number): Promise<ReadNotificationResult> {
    const updated = await notificationRepository.markRead(userId, id);
    if (updated === 0) {
      // 남의 알림과 없는 알림을 구분해 주면 id 존재 여부가 새어나가므로 둘 다 404입니다
      throw AppError.notFound("알림을 찾을 수 없습니다");
    }
    return { id, isRead: true };
  },

  async markAllRead(userId: number): Promise<UpdatedCountResult> {
    return { updatedCount: await notificationRepository.markAllRead(userId) };
  },

  async delete(userId: number, id: number): Promise<DeletedCountResult> {
    const deleted = await notificationRepository.deleteOwned(userId, [id]);
    if (deleted.deletedCount === 0) {
      throw AppError.notFound("알림을 찾을 수 없습니다");
    }
    return deleted;
  },

  async bulkDelete(userId: number, ids: number[]): Promise<DeletedCountResult> {
    const uniqueIds = [...new Set(ids)];
    return notificationRepository.deleteOwned(userId, uniqueIds);
  },
};
