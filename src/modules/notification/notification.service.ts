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
 * 확정·이사 알림처럼 대상이 N명일 때
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
 * 닉네임이 없어도 알림은 남깁니다. 견적 카드와 같이 기사님 이름으로 대체하고,
 * 이름도 비어 있으면 "기사님"을 씁니다.
 */
function moverDisplayName(mover: {
  name: string;
  moverProfile: { nickName: string } | null;
}): string {
  const nickName = mover.moverProfile?.nickName.trim();
  if (nickName) return nickName;
  const name = mover.name.trim();
  return name || "기사님";
}

/**
 * 원본 relation으로 payload를 만듭니다.
 *
 * estimate/quotationRequest가 없으면 문구를 만들 수 없어 null을 돌려 목록에서 제외합니다.
 */
/**
 * 고객의 가장 최근 응답 — 같은 요청에서 처리한 건은 respondedAt이 같고 결정도 같아,
 * 가장 늦은 respondedAt의 건들을 묶으면 방금 한 응답이 됩니다.
 */
function lastResponse(charges: { amount: number; status: string; respondedAt: Date | null }[]): {
  amount: number;
  approved: boolean;
} {
  const responded = charges.filter((c) => c.respondedAt);
  const last = Math.max(0, ...responded.map((c) => c.respondedAt!.getTime()));
  const batch = responded.filter((c) => c.respondedAt!.getTime() === last);
  return {
    amount: batch.reduce((sum, c) => sum + c.amount, 0),
    approved: batch.some((c) => c.status === "APPROVED"),
  };
}

function toItem(row: NotificationRow): NotificationItem | null {
  const base = {
    id: row.id,
    isRead: row.isRead,
    createdAt: row.createdAt,
    estimateId: row.estimateId,
    quotationRequestId: row.quotationRequestId,
    chatRoomId: row.chatRoomId,
  };

  switch (row.type) {
    case "NEW_REQUEST": {
      const request = row.quotationRequest;
      if (!request) return null;
      return {
        ...base,
        type: "NEW_REQUEST",
        payload: {
          customerName: request.user.name,
          category: request.category,
          fromRegion: request.fromRegion,
          movingDate: request.movingDate,
        },
      };
    }

    case "NEW_ESTIMATE": {
      if (!row.estimate) return null;
      return {
        ...base,
        type: "NEW_ESTIMATE",
        payload: {
          moverNickName: moverDisplayName(row.estimate.mover),
          category: row.estimate.quotationRequest.category,
          price: row.estimate.price,
        },
      };
    }

    case "PAYMENT_REQUEST": {
      if (!row.estimate) return null;
      return {
        ...base,
        type: "PAYMENT_REQUEST",
        payload: {
          moverNickName: moverDisplayName(row.estimate.mover),
          category: row.estimate.quotationRequest.category,
          price: row.estimate.price,
        },
      };
    }

    case "PAYMENT_COMPLETED": {
      if (!row.estimate) return null;
      return {
        ...base,
        type: "PAYMENT_COMPLETED",
        payload: {
          customerName: row.estimate.quotationRequest.user.name,
          category: row.estimate.quotationRequest.category,
          price: row.estimate.price,
        },
      };
    }

    case "EXTRA_CHARGE_PROPOSED": {
      if (!row.estimate) return null;
      return {
        ...base,
        type: "EXTRA_CHARGE_PROPOSED",
        payload: {
          moverNickName: moverDisplayName(row.estimate.mover),
          category: row.estimate.quotationRequest.category,
          // 방금 보낸 건 = 가장 최근 건
          amount: row.estimate.extraCharges[row.estimate.extraCharges.length - 1]?.amount ?? null,
        },
      };
    }

    case "EXTRA_CHARGE_RESPONDED": {
      if (!row.estimate) return null;
      return {
        ...base,
        type: "EXTRA_CHARGE_RESPONDED",
        payload: {
          customerName: row.estimate.quotationRequest.user.name,
          category: row.estimate.quotationRequest.category,
          ...lastResponse(row.estimate.extraCharges),
        },
      };
    }

    case "DEPOSIT_PAID": {
      if (!row.estimate) return null;
      return {
        ...base,
        type: "DEPOSIT_PAID",
        payload: {
          customerName: row.estimate.quotationRequest.user.name,
          category: row.estimate.quotationRequest.category,
          amount: row.estimate.depositAmount,
        },
      };
    }

    case "DEPOSIT_EXPIRED": {
      if (!row.estimate) return null;
      return {
        ...base,
        type: "DEPOSIT_EXPIRED",
        payload: {
          moverNickName: moverDisplayName(row.estimate.mover),
          customerName: row.estimate.quotationRequest.user.name,
          category: row.estimate.quotationRequest.category,
        },
      };
    }

    case "ESTIMATE_CONFIRMED": {
      if (!row.estimate) return null;
      return {
        ...base,
        type: "ESTIMATE_CONFIRMED",
        payload: {
          moverNickName: moverDisplayName(row.estimate.mover),
          customerName: row.estimate.quotationRequest.user.name,
          category: row.estimate.quotationRequest.category,
        },
      };
    }

    case "ESTIMATE_REJECTED": {
      if (!row.estimate) return null;
      return {
        ...base,
        type: "ESTIMATE_REJECTED",
        payload: {
          moverNickName: moverDisplayName(row.estimate.mover),
          category: row.estimate.quotationRequest.category,
        },
      };
    }

    case "MOVING_DAY":
    case "MOVING_DAY_BEFORE": {
      const request = row.quotationRequest;
      if (!request) return null;
      return {
        ...base,
        type: row.type,
        payload: {
          fromRegion: request.fromRegion,
          toRegion: request.toRegion,
          fromAddress: request.fromAddress,
          toAddress: request.toAddress,
          movingDate: request.movingDate,
        },
      };
    }

    case "NEW_CHAT_MESSAGE": {
      const room = row.chatRoom;
      if (!room || row.chatRoomId === null) return null;
      // 받는 사람이 고객이면 보낸 사람은 기사님, 아니면 고객입니다
      const senderName =
        row.userId === room.customerId ? moverDisplayName(room.mover) : room.customer.name;
      return {
        ...base,
        type: "NEW_CHAT_MESSAGE",
        payload: { roomId: row.chatRoomId, senderName },
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

  /** 오늘 올라온 견적 요청을 기사님 지역·이사유형별로 묶습니다 (기사님 전용) */
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
