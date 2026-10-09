import type { Prisma } from "../../../generated/prisma/client.ts";
import type { RegionType, ServiceType } from "../../../generated/prisma/enums.ts";
import { prisma, type PrismaTransaction } from "../../config/prisma";

// Prisma.InputJsonValue만 사용 — payload 스냅샷 저장용

type Db = typeof prisma | PrismaTransaction;

export const moverAiRepository = {
  createSession(userId: number, db: Db = prisma) {
    return db.moverAiSession.create({
      data: { userId },
    });
  },

  findOwnedSession(sessionId: string, userId: number, db: Db = prisma) {
    return db.moverAiSession.findFirst({
      where: { id: sessionId, userId },
    });
  },

  findOwnedSessionWithMessages(sessionId: string, userId: number, db: Db = prisma) {
    return db.moverAiSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  },

  updateSessionSlots(
    sessionId: string,
    data: {
      region?: RegionType | null;
      service?: ServiceType | null;
      sort?: string | null;
      cursor?: string | null;
    },
    db: Db = prisma
  ) {
    return db.moverAiSession.update({
      where: { id: sessionId },
      data,
    });
  },

  createMessage(
    data: {
      sessionId: string;
      role: string;
      content: string;
      payload?: Prisma.InputJsonValue;
    },
    db: Db = prisma
  ) {
    return db.moverAiMessage.create({ data });
  },

  findMessages(sessionId: string, take?: number, db: Db = prisma) {
    return db.moverAiMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      ...(take ? { take } : {}),
    });
  },

  /** Gemini 컨텍스트용 — 최근 N턴 (최신순 조회 후 시간순 정렬) */
  findRecentMessages(sessionId: string, take: number, db: Db = prisma) {
    return db.moverAiMessage
      .findMany({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
        take,
      })
      .then((rows) => rows.reverse());
  },

  findLatestAssistant(sessionId: string, db: Db = prisma) {
    return db.moverAiMessage.findFirst({
      where: { sessionId, role: "ASSISTANT" },
      orderBy: { createdAt: "desc" },
    });
  },

  /** 찜 대상 추천을 찾기 위해 최근 어시스턴트 메시지를 최신순으로 가져옵니다 */
  findRecentAssistants(sessionId: string, take: number, db: Db = prisma) {
    return db.moverAiMessage.findMany({
      where: { sessionId, role: "ASSISTANT" },
      orderBy: { createdAt: "desc" },
      take,
    });
  },
};
