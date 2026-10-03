import { getExpireBaseDate } from "../../jobs/expireRequests.util";
import { prisma } from "../../config/prisma";

const DEFAULT_TAKE = 10;

/** 이사 완료(COMPLETED) 후 채팅을 유지하는 기간 */
export const CHAT_RETENTION_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
/** KST는 서머타임이 없어 UTC+9 고정입니다 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 닫힌 방 — 이사 완료(COMPLETED) 후 14일이 지난 방. 지난 대화는 볼 수 있지만 새 메시지는 보낼 수 없습니다.
 * 완료일이 D(KST)면 D일을 1일째로 세어 D+13일 23:59:59까지 보낼 수 있고, D+14일 00시(KST)에 닫힙니다.
 * 닫힘 시각이 자정이라 "완료 시각 < 오늘 00시(KST) - 13일"로 같은 판정을 합니다.
 *
 * 완료 시각 컬럼이 따로 없어 estimate.updatedAt을 씁니다 — COMPLETED 이후에는 estimate를 고치는 곳이 없어
 * 완료 처리 시각이 그대로 남습니다. (ponytail: 완료 후 estimate를 수정하는 코드가 생기면 completedAt 컬럼 추가)
 */
export function isRoomClosed(
  estimate: { estimateStatus: string; updatedAt: Date },
  now: Date = new Date()
): boolean {
  if (estimate.estimateStatus !== "COMPLETED") return false;
  // getExpireBaseDate는 KST 오늘 날짜를 UTC 자정으로 돌려주므로, 실제 KST 00시 시각으로 되돌립니다
  const kstMidnight = new Date(getExpireBaseDate(now).getTime() - KST_OFFSET_MS);
  const since = new Date(kstMidnight.getTime() - (CHAT_RETENTION_DAYS - 1) * DAY_MS);
  return estimate.updatedAt < since;
}

const roomInclude = {
  customer: { select: { id: true, name: true, customerProfile: { select: { image: true } } } },
  mover: {
    select: { id: true, name: true, moverProfile: { select: { nickName: true, image: true } } },
  },
  // 닫힘 여부(isClosed) 판정용
  estimate: { select: { estimateStatus: true, updatedAt: true } },
  messages: {
    orderBy: { id: "desc" as const },
    take: 1,
    select: { id: true, content: true, imageUrl: true, senderId: true, createdAt: true },
  },
} as const;

export const chatRepository = {
  /** 내가 참여한 방을 최근 대화순으로. 다음 페이지 판별용으로 take+1개를 읽습니다 */
  findRoomsByUser(
    userId: number,
    role: "CUSTOMER" | "MOVER",
    cursor?: number,
    take = DEFAULT_TAKE
  ) {
    return prisma.chatRoom.findMany({
      where: role === "CUSTOMER" ? { customerId: userId } : { moverId: userId },
      include: roomInclude,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
  },

  /**
   * 방마다 "내가 읽은 마지막 메시지 이후 상대가 보낸 메시지 수".
   * 방마다 읽음 위치가 달라 하나의 where로 못 묶으니 방별 조건을 OR로 이어 groupBy 한 번으로 셉니다
   * (방마다 count를 따로 보내면 한 목록에 최대 20번의 쿼리가 나갑니다). 메시지가 없는 방은 Map에 없습니다.
   */
  async countUnreadByRoom(
    userId: number,
    rooms: { id: number; lastReadId: number | null }[]
  ): Promise<Map<number, number>> {
    if (rooms.length === 0) return new Map();

    const rows = await prisma.chatMessage.groupBy({
      by: ["roomId"],
      where: {
        OR: rooms.map(({ id, lastReadId }) => ({
          roomId: id,
          senderId: { not: userId },
          ...(lastReadId && { id: { gt: lastReadId } }),
        })),
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.roomId, row._count._all]));
  },
};

type Role = "CUSTOMER" | "MOVER";

const MESSAGE_TAKE = 30;

export const chatMessageRepository = {
  /** 참여자(고객·기사님)만 방을 볼 수 있습니다. 아니면 null이라 존재 여부도 드러나지 않습니다 */
  findRoomForUser(roomId: number, userId: number) {
    return prisma.chatRoom.findFirst({
      where: { id: roomId, OR: [{ customerId: userId }, { moverId: userId }] },
      include: { estimate: { select: { estimateStatus: true, updatedAt: true } } },
    });
  },

  /** 최신순. 다음 페이지 판별용으로 take+1개를 읽습니다 */
  findMessages(roomId: number, cursor?: number, take = MESSAGE_TAKE) {
    return prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { id: "desc" },
      take: take + 1,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
  },

  /**
   * 메시지 저장 + 방 최근 대화 시각 갱신 + 받는 사람의 알림 1건 갱신.
   * 보낸 사람의 lastReadId는 올리지 않습니다 — 올리면 그 사이 도착한 상대 메시지까지 읽은 것이 됩니다.
   * 내가 보낸 메시지는 안 읽음 수(senderId != 나)에 원래 들어가지 않습니다.
   *
   * 알림은 메시지마다 만들지 않고 (받는 사람, 방)당 1건을 유지합니다. 새 메시지가 오면 같은 행을
   * 읽지 않음으로 되돌리고 시각을 올려 목록 맨 위로 보냅니다. partial unique 인덱스는 Prisma upsert의
   * 대상이 될 수 없어 createMany(skipDuplicates) + updateMany로 처리합니다. 원시 SQL은 쓰지 않습니다
   * (다른 스키마를 쓰는 DB에서 테이블 이름을 못 찾는 문제를 피합니다).
   */
  createMessage(
    roomId: number,
    senderId: number,
    recipientId: number,
    content: string,
    imageUrl?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data: { roomId, senderId, content, imageUrl: imageUrl ?? null },
      });
      await tx.chatRoom.update({
        where: { id: roomId },
        data: { lastMessageAt: message.createdAt },
      });
      // 기존 행을 먼저 올립니다. 행이 있으면 여기서 끝나므로 partial unique 인덱스가 없는 DB에서도
      // 메시지마다 알림이 쌓이지 않습니다.
      const bump = {
        where: { userId: recipientId, chatRoomId: roomId },
        data: { isRead: false, createdAt: message.createdAt },
      };
      const { count } = await tx.notification.updateMany(bump);
      if (count === 0) {
        // 방의 첫 메시지 — 만듭니다. 동시에 첫 메시지가 둘 오면 partial unique가 하나를 건너뛰게 하고
        // (트랜잭션은 중단되지 않습니다), 건너뛴 쪽도 다시 올려 읽지 않음·시각을 맞춥니다.
        await tx.notification.createMany({
          data: [{ userId: recipientId, chatRoomId: roomId, type: "NEW_CHAT_MESSAGE" }],
          skipDuplicates: true,
        });
        await tx.notification.updateMany(bump);
      }
      return message;
    });
  },

  /**
   * 방의 마지막 메시지까지 읽음 처리. 이미 그 이상이면 건드리지 않습니다(커지는 방향으로만).
   * 이 방의 채팅 알림도 함께 읽음으로 바꿔, 채팅에서 읽었는데 알림에 읽지 않음이 남지 않게 합니다.
   */
  async markRead(roomId: number, role: Role, userId: number) {
    const latest = await prisma.chatMessage.findFirst({
      where: { roomId },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    if (!latest) return { lastReadId: null, updated: false };

    await prisma.notification.updateMany({
      where: { userId, chatRoomId: roomId, isRead: false },
      data: { isRead: true },
    });

    const { count } =
      role === "CUSTOMER"
        ? await prisma.chatRoom.updateMany({
            where: {
              id: roomId,
              OR: [{ customerLastReadId: null }, { customerLastReadId: { lt: latest.id } }],
            },
            data: { customerLastReadId: latest.id },
          })
        : await prisma.chatRoom.updateMany({
            where: {
              id: roomId,
              OR: [{ moverLastReadId: null }, { moverLastReadId: { lt: latest.id } }],
            },
            data: { moverLastReadId: latest.id },
          });
    return { lastReadId: latest.id, updated: count === 1 };
  },
};
