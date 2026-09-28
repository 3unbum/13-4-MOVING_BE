import { prisma } from "../../config/prisma";
import type { PrismaTransaction } from "../../config/prisma";
import type { RegionType, ServiceType } from "../../../generated/prisma/enums.ts";
import type { CreateNotificationParams } from "./notification.type";

const DEFAULT_TAKE = 10;

/**
 * payload 조립에 필요한 최소 필드만 가져옵니다.
 * user는 password 등이 새어나가지 않도록 이름만 select합니다 (estimate.repository와 같은 이유).
 */
const notificationDetailInclude = {
  estimate: {
    select: {
      price: true,
      mover: {
        select: { moverProfile: { select: { nickName: true } } },
      },
      quotationRequest: {
        select: {
          category: true,
          fromAddress: true,
          toAddress: true,
          movingDate: true,
          user: { select: { name: true } },
        },
      },
    },
  },
  quotationRequest: {
    select: {
      category: true,
      fromRegion: true,
      fromAddress: true,
      toAddress: true,
      movingDate: true,
    },
  },
} as const;

function listArgs(cursor?: number, take = DEFAULT_TAKE) {
  return {
    take,
    orderBy: { id: "desc" as const },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  };
}

function toCreateData(params: CreateNotificationParams) {
  return {
    userId: params.userId,
    type: params.type,
    estimateId: params.estimateId ?? null,
    quotationRequestId: params.quotationRequestId ?? null,
    message: params.message ?? null,
  };
}

export const notificationRepository = {
  /** 견적 요청·발송·확정 트랜잭션 안에서 호출되므로 tx를 받습니다 */
  create(params: CreateNotificationParams, tx: PrismaTransaction = prisma) {
    return tx.notification.create({ data: toCreateData(params) });
  },

  /** 지역 기사님 전원에게 보내는 NEW_REQUEST처럼 대상이 여러 명일 때 왕복을 1회로 줄입니다 */
  createMany(paramsList: CreateNotificationParams[], tx: PrismaTransaction = prisma) {
    return tx.notification.createMany({ data: paramsList.map(toCreateData) });
  },

  findManyByUserId(userId: number, cursor?: number, take?: number) {
    return prisma.notification.findMany({
      where: { userId },
      include: notificationDetailInclude,
      ...listArgs(cursor, take),
    });
  },

  countUnread(userId: number) {
    return prisma.notification.count({ where: { userId, isRead: false } });
  },

  /**
   * 본인 알림만 갱신합니다. 조회 후 갱신으로 나누면 그사이 소유자가 바뀔 일은 없지만
   * 왕복이 두 번이 되므로, where에 userId를 함께 넣고 count로 존재 여부를 판정합니다.
   */
  async markRead(userId: number, id: number) {
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return result.count;
  },

  async markAllRead(userId: number) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  },

  async deleteOwned(userId: number, ids: number[]) {
    if (ids.length === 0) return 0;

    const result = await prisma.notification.deleteMany({
      where: { id: { in: ids }, userId },
    });
    return result.count;
  },

  /**
   * 미확인 NEW_REQUEST를 지역·이사유형으로 집계합니다.
   *
   * Prisma groupBy는 relation 필드를 기준으로 묶을 수 없어 raw SQL을 씁니다.
   * 알림을 전부 읽어와 메모리에서 세면 미확인이 많은 기사님에서 응답이 커지므로
   * 집계를 DB에 맡깁니다. COUNT(*)는 bigint라 ::int로 캐스팅해야 number로 옵니다.
   * type은 Postgres enum이라 바인딩 파라미터에 명시적 캐스트가 필요합니다.
   */
  summarizeUnreadNewRequests(userId: number) {
    return prisma.$queryRaw<{ region: RegionType; category: ServiceType; count: number }[]>`
      SELECT qr.from_region AS region, qr.category AS category, COUNT(*)::int AS count
      FROM notification n
      JOIN quotation_request qr ON qr.id = n.quotation_request_id
      WHERE n.user_id = ${userId}
        AND n.type = CAST(${"NEW_REQUEST"} AS notification_type)
        AND n.is_read = false
      GROUP BY qr.from_region, qr.category
      ORDER BY count DESC, region ASC, category ASC
    `;
  },
};
