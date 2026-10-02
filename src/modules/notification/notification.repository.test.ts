import { prisma } from "../../config/prisma";
import { kstTodayRange, notificationRepository } from "./notification.repository";

jest.mock("../../config/prisma", () => ({
  prisma: {
    notification: { count: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
    moverRegion: { findMany: jest.fn() },
    moverService: { findMany: jest.fn() },
    quotationRequest: { groupBy: jest.fn() },
  },
}));

// repository가 Prisma.join을 값으로 import합니다. 실제 client는 .ts 상대 경로 때문에 깨집니다.
jest.mock("../../../generated/prisma/client.ts", () => ({
  Prisma: { join: jest.fn() },
}));

const mockedPrisma = jest.mocked(prisma);

beforeEach(() => jest.clearAllMocks());

describe("notificationRepository.countUnread", () => {
  it("목록에 나올 수 있는 안 읽은 알림만 센다", async () => {
    mockedPrisma.notification.count.mockResolvedValue(2);

    const count = await notificationRepository.countUnread(7);

    expect(count).toBe(2);
    expect(mockedPrisma.notification.count).toHaveBeenCalledWith({
      where: {
        userId: 7,
        isRead: false,
        OR: [
          {
            type: { in: ["NEW_REQUEST", "MOVING_DAY", "MOVING_DAY_BEFORE"] },
            quotationRequestId: { not: null },
          },
          {
            type: { in: ["NEW_ESTIMATE", "ESTIMATE_CONFIRMED"] },
            estimateId: { not: null },
          },
          { type: "NEW_CHAT_MESSAGE", chatRoomId: { not: null } },
        ],
      },
    });
  });
});

describe("notificationRepository.findManyByUserId", () => {
  it("닫힌 방도 지난 대화를 볼 수 있어 채팅 알림을 그대로 목록에 둔다", async () => {
    mockedPrisma.notification.findMany.mockResolvedValue([]);

    await notificationRepository.findManyByUserId(7, undefined, 11);

    const args = mockedPrisma.notification.findMany.mock.calls[0][0];
    expect(args?.where).toEqual({ userId: 7 });
  });

  it("createdAt 내림차순(같으면 id 내림차순)으로 정렬해 갱신된 채팅 알림이 위로 올라온다", async () => {
    mockedPrisma.notification.findMany.mockResolvedValue([]);

    await notificationRepository.findManyByUserId(7, 42, 11);

    const args = mockedPrisma.notification.findMany.mock.calls[0][0];
    expect(args?.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    // 커서는 id 하나로 두고 Prisma가 정렬 값 기준으로 위치를 잡는다
    expect(args).toMatchObject({ skip: 1, cursor: { id: 42 }, take: 11 });
  });
});

describe("kstTodayRange", () => {
  it("KST 낮에는 그날 00:00부터 다음 날 00:00 전까지를 반환한다", () => {
    // UTC 09-04 04:30 = KST 09-04 13:30
    expect(kstTodayRange(new Date("2026-09-04T04:30:00.000Z"))).toEqual({
      start: new Date("2026-09-03T15:00:00.000Z"),
      end: new Date("2026-09-04T15:00:00.000Z"),
    });
  });

  it("KST 자정 직후는 새 날로 넘어간다", () => {
    // UTC 09-04 15:10 = KST 09-05 00:10
    expect(kstTodayRange(new Date("2026-09-04T15:10:00.000Z"))).toEqual({
      start: new Date("2026-09-04T15:00:00.000Z"),
      end: new Date("2026-09-05T15:00:00.000Z"),
    });
  });

  it("KST 자정 직전은 아직 그날이다", () => {
    // UTC 09-04 14:59 = KST 09-04 23:59
    expect(kstTodayRange(new Date("2026-09-04T14:59:00.000Z"))).toEqual({
      start: new Date("2026-09-03T15:00:00.000Z"),
      end: new Date("2026-09-04T15:00:00.000Z"),
    });
  });
});

describe("notificationRepository.summarizeUnreadNewRequests", () => {
  it("오늘 만든 견적 요청을 기사님 지역·이사유형으로 센다", async () => {
    // UTC 09-04 04:30 = KST 09-04 13:30
    const now = new Date("2026-09-04T04:30:00.000Z");
    mockedPrisma.moverRegion.findMany.mockResolvedValue([{ region: "GYEONGGI" }] as never);
    mockedPrisma.moverService.findMany.mockResolvedValue([{ service: "SMALL" }] as never);
    mockedPrisma.quotationRequest.groupBy.mockResolvedValue([
      { fromRegion: "GYEONGGI", category: "SMALL", _count: { _all: 3 } },
    ] as never);

    const rows = await notificationRepository.summarizeUnreadNewRequests(7, now);

    expect(rows).toEqual([{ region: "GYEONGGI", category: "SMALL", count: 3 }]);
    expect(mockedPrisma.quotationRequest.groupBy).toHaveBeenCalledWith({
      by: ["fromRegion", "category"],
      where: {
        createdAt: {
          gte: new Date("2026-09-03T15:00:00.000Z"),
          lt: new Date("2026-09-04T15:00:00.000Z"),
        },
        fromRegion: { in: ["GYEONGGI"] },
        category: { in: ["SMALL"] },
        quotationStatus: "PENDING",
        estimates: { none: { moverId: 7 } },
        movingDate: { gt: new Date("2026-09-04T00:00:00.000Z") },
      },
      _count: { _all: true },
    });
    expect(mockedPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("지역이나 이사유형이 없으면 요청을 세지 않는다", async () => {
    mockedPrisma.moverRegion.findMany.mockResolvedValue([] as never);
    mockedPrisma.moverService.findMany.mockResolvedValue([{ service: "SMALL" }] as never);

    const rows = await notificationRepository.summarizeUnreadNewRequests(7);

    expect(rows).toEqual([]);
    expect(mockedPrisma.quotationRequest.groupBy).not.toHaveBeenCalled();
  });
});
