import { prisma } from "../../config/prisma";
import type { PrismaTransaction } from "../../config/prisma";
import { Prisma } from "../../../generated/prisma/client.ts";
import { getExpireBaseDate } from "../../jobs/expireRequests.util";
import type { CreateNotificationParams } from "./notification.type";

const DEFAULT_TAKE = 10;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 한국 시간 오늘 00:00 이상, 내일 00:00 미만.
 * 끝은 exclusive라 23:59:59.999까지 오늘에 포함됩니다.
 *
 * getExpireBaseDate는 달력일을 UTC 자정으로 표현해서 @db.Date 비교에만 씁니다.
 * created_at은 시각이라, KST 자정을 실제 시각(UTC-9시간)으로 잡아야 합니다.
 */
export function kstTodayRange(now: Date = new Date()): { start: Date; end: Date } {
  const [year, month, day] = kstDateFormatter.format(now).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day) - KST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/**
 * payload 조립에 필요한 최소 필드만 가져옵니다.
 * user는 password 등이 새어나가지 않도록 이름만 select합니다 (estimate.repository와 같은 이유).
 */
const notificationDetailInclude = {
  estimate: {
    select: {
      price: true,
      // 선수금 알림 문구에 쓰는 금액
      depositAmount: true,
      // 추가 금액 알림 문구에 쓰는 금액과 고객의 응답 결과
      extraCharges: {
        select: { amount: true, status: true, respondedAt: true },
        orderBy: { id: "asc" },
      },
      mover: {
        select: {
          name: true,
          moverProfile: { select: { nickName: true } },
        },
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
      toRegion: true,
      fromAddress: true,
      toAddress: true,
      movingDate: true,
      user: { select: { name: true } },
    },
  },
  // 채팅 알림 — 받는 사람 기준으로 상대 이름을 고르려고 양쪽 참가자를 읽습니다
  chatRoom: {
    select: {
      customerId: true,
      customer: { select: { name: true } },
      mover: { select: { name: true, moverProfile: { select: { nickName: true } } } },
    },
  },
} as const;

/**
 * 최신순 = createdAt 내림차순, 같으면 id 내림차순.
 * 채팅 알림은 방당 한 행을 재사용하며 새 메시지가 오면 createdAt을 올리므로(chat.repository.createMessage)
 * id만으로 정렬하면 처음 만든 자리에 묻힙니다. 커서는 id 하나로 충분합니다 —
 * Prisma가 커서 행의 정렬 값(createdAt, id)을 기준으로 다음 위치를 잡습니다.
 */
function listArgs(cursor?: number, take = DEFAULT_TAKE) {
  return {
    take,
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
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

  /** 확정·이사 알림처럼 대상이 여러 명일 때 왕복을 1회로 줄입니다 */
  createMany(paramsList: CreateNotificationParams[], tx: PrismaTransaction = prisma) {
    return tx.notification.createMany({ data: paramsList.map(toCreateData) });
  },

  findManyByUserId(userId: number, cursor?: number, take?: number, isRead?: boolean) {
    return prisma.notification.findMany({
      where: { userId, ...(isRead !== undefined && { isRead }) },
      include: notificationDetailInclude,
      ...listArgs(cursor, take),
    });
  },

  /**
   * 목록에 노출되는 안 읽은 알림만 셉니다.
   * toItem이 원본이 없는 행을 빼므로, 여기서도 타입에 맞는 FK가 있는 행만 셉니다.
   * 프로필 닉네임은 목록에서 이름으로 대체하므로 조건에 넣지 않습니다.
   */
  countUnread(userId: number) {
    return prisma.notification.count({
      where: {
        userId,
        isRead: false,
        OR: [
          {
            type: { in: ["NEW_REQUEST", "MOVING_DAY", "MOVING_DAY_BEFORE"] },
            quotationRequestId: { not: null },
          },
          {
            type: {
              in: [
                "NEW_ESTIMATE",
                "ESTIMATE_CONFIRMED",
                "ESTIMATE_REJECTED",
                "PAYMENT_REQUEST",
                "PAYMENT_COMPLETED",
                "DEPOSIT_PAID",
                "DEPOSIT_EXPIRED",
                "EXTRA_CHARGE_PROPOSED",
                "EXTRA_CHARGE_RESPONDED",
              ],
            },
            estimateId: { not: null },
          },
          {
            type: "NEW_CHAT_MESSAGE",
            chatRoomId: { not: null },
          },
        ],
      },
    });
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

  /**
   * 본인 알림만 지우고, 실제로 지워진 id를 돌려줍니다.
   * deleteMany는 개수만 줘서, 요청에 섞인 남의 id까지 프론트가 목록에서 빼게 됩니다.
   */
  async deleteOwned(userId: number, ids: number[]) {
    if (ids.length === 0) {
      return { deletedCount: 0, deletedIds: [] as number[] };
    }

    const deleted = await prisma.$queryRaw<{ id: number }[]>`
      DELETE FROM notification
      WHERE user_id = ${userId}
        AND id IN (${Prisma.join(ids)})
      RETURNING id
    `;
    const deletedIds = deleted.map((row) => row.id);

    return { deletedCount: deletedIds.length, deletedIds };
  },

  /**
   * 오늘 만들어진 견적 요청을 기사님 지역·이사유형으로 집계합니다.
   * 알림을 조인하지 않아서 읽음·전체 삭제와 무관합니다.
   *
   * 대상은 받은 요청 목록과 같습니다. PENDING이고, 이 기사님이 아직 견적을 내지 않았고,
   * 이사일이 오늘(KST)보다 뒤인 요청만 셉니다.
   * 거기에 기사님의 서비스 지역·이사유형 교집합과 오늘 생성 시각을 더합니다.
   */
  async summarizeUnreadNewRequests(userId: number, now: Date = new Date()) {
    const { start, end } = kstTodayRange(now);
    const [regions, services] = await Promise.all([
      prisma.moverRegion.findMany({ where: { moverId: userId }, select: { region: true } }),
      prisma.moverService.findMany({ where: { moverId: userId }, select: { service: true } }),
    ]);
    const regionList = regions.map((row) => row.region);
    const serviceList = services.map((row) => row.service);
    if (regionList.length === 0 || serviceList.length === 0) return [];

    const rows = await prisma.quotationRequest.groupBy({
      by: ["fromRegion", "category"],
      where: {
        createdAt: { gte: start, lt: end },
        fromRegion: { in: regionList },
        category: { in: serviceList },
        quotationStatus: "PENDING",
        estimates: { none: { moverId: userId } },
        movingDate: { gt: getExpireBaseDate(now) },
      },
      _count: { _all: true },
    });

    return rows
      .map((row) => ({
        region: row.fromRegion,
        category: row.category,
        count: row._count._all,
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.region.localeCompare(b.region) ||
          a.category.localeCompare(b.category)
      );
  },
};
