import cron from "node-cron";
import { prisma } from "@/config/prisma";
import { incrementMoverCareer, scheduleMoverCareerIncrement } from "./moverCareerIncrement.job";

// 테스트가 실제로 크론을 걸지 않도록 끊습니다
jest.mock("node-cron", () => ({ schedule: jest.fn() }));

jest.mock("@/config/prisma", () => ({
  prisma: { $executeRaw: jest.fn() },
}));

const mockedPrisma = jest.mocked(prisma);

describe("incrementMoverCareer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mover_profile.career를 갱신하는 쿼리를 실행한다", async () => {
    (mockedPrisma.$executeRaw as unknown as jest.Mock).mockResolvedValue(3);

    await incrementMoverCareer();

    expect(mockedPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe("scheduleMoverCareerIncrement", () => {
  it("매년 1/1 00:00 (KST)로 크론을 등록한다", () => {
    scheduleMoverCareerIncrement();

    expect(cron.schedule).toHaveBeenCalledWith("0 0 1 1 *", incrementMoverCareer, {
      timezone: "Asia/Seoul",
    });
  });
});
