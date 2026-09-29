import { prisma } from "../../config/prisma";
import { notificationRepository } from "./notification.repository";

jest.mock("../../config/prisma", () => ({
  prisma: {
    notification: { count: jest.fn() },
    $queryRaw: jest.fn(),
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
            type: { in: ["NEW_REQUEST", "MOVING_DAY"] },
            quotationRequestId: { not: null },
          },
          {
            type: { in: ["NEW_ESTIMATE", "ESTIMATE_CONFIRMED"] },
            estimateId: { not: null },
          },
        ],
      },
    });
  });
});

describe("notificationRepository.summarizeUnreadNewRequests", () => {
  it("DB에 저장된 enum 라벨을 API enum으로 변환한다", async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([
      { region: "경기", category: "소형이사", count: 3 },
      { region: "서울", category: "가정이사", count: 2 },
    ]);

    const rows = await notificationRepository.summarizeUnreadNewRequests(7);

    expect(rows).toEqual([
      { region: "GYEONGGI", category: "SMALL", count: 3 },
      { region: "SEOUL", category: "HOME", count: 2 },
    ]);
  });
});
