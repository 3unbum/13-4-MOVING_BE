import { prisma } from "@/config/prisma";
import { createManyNotifications } from "@/modules/notification/notification.service";
import { publishNotification } from "@/modules/notification/notification.sse";
import { getExpireBaseDate } from "@/jobs/expireRequests.util";
import { notifyMovingDay } from "./movingDayNotify.job";

// 테스트가 실제로 크론을 걸지 않도록 끊습니다
jest.mock("node-cron", () => ({ schedule: jest.fn() }));

jest.mock("@/config/prisma", () => ({
  prisma: {
    quotationRequest: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/modules/notification/notification.service", () => ({
  createManyNotifications: jest.fn(),
}));

jest.mock("@/modules/notification/notification.sse", () => ({
  publishNotification: jest.fn(),
}));

// 실제 generated client를 로드하면 내부 상대 import(.ts)까지 따라가 해석이 깨집니다.
jest.mock("../../generated/prisma/client.ts", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code = "P2034";
    },
  },
}));

import { Prisma } from "../../generated/prisma/client.ts";

const mockedPrisma = jest.mocked(prisma);

/** 트랜잭션 안에서 중복 확인에 쓰는 메서드만 갖춘 가짜 tx */
function makeTx(existing: { userId: number }[]) {
  return {
    notification: { findMany: jest.fn().mockResolvedValue(existing) },
  };
}

/** 이번 실행에서 이미 알림을 받은 수신자 목록을 주고 트랜잭션을 흉내 냅니다 */
function arrangeTransaction(existing: { userId: number }[] = []) {
  const tx = makeTx(existing);
  (mockedPrisma.$transaction as unknown as jest.Mock).mockImplementation(
    (callback: (tx: unknown) => unknown) => callback(tx)
  );
  return tx;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe("notifyMovingDay", () => {
  it("오늘 이사하는 ASSIGNED 요청만 조회한다", async () => {
    // Setup
    (mockedPrisma.quotationRequest.findMany as jest.Mock).mockResolvedValue([]);

    // Exercise
    await notifyMovingDay();

    // Assertion — 확정 기사님이 없는 요청에는 알릴 상대가 없습니다
    expect(mockedPrisma.quotationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { movingDate: getExpireBaseDate(), quotationStatus: "ASSIGNED" },
      })
    );
  });

  it("대상이 없으면 트랜잭션을 열지 않는다", async () => {
    // Setup
    (mockedPrisma.quotationRequest.findMany as jest.Mock).mockResolvedValue([]);

    // Exercise
    await notifyMovingDay();

    // Assertion
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("고객과 확정 기사님 양쪽에 알림을 만든다", async () => {
    // Setup
    (mockedPrisma.quotationRequest.findMany as jest.Mock).mockResolvedValue([
      { id: 100, userId: 7, estimates: [{ moverId: 5 }] },
    ]);
    const tx = arrangeTransaction();

    // Exercise
    await notifyMovingDay();

    // Assertion
    expect(createManyNotifications).toHaveBeenCalledWith(tx, [
      { userId: 7, type: "MOVING_DAY", quotationRequestId: 100 },
      { userId: 5, type: "MOVING_DAY", quotationRequestId: 100 },
    ]);
    // 트랜잭션이 끝난 뒤에 신호를 보냅니다 — 롤백된 알림이 실시간으로 나가지 않게
    expect(publishNotification).toHaveBeenCalledWith([7, 5], { type: "MOVING_DAY" });
    expect(mockedPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it("이미 보낸 수신자는 건너뛴다 (재실행해도 중복되지 않는다)", async () => {
    // Setup — 고객에게는 이미 보냈고 기사님에게는 아직 못 보낸 상태
    (mockedPrisma.quotationRequest.findMany as jest.Mock).mockResolvedValue([
      { id: 100, userId: 7, estimates: [{ moverId: 5 }] },
    ]);
    const tx = arrangeTransaction([{ userId: 7 }]);

    // Exercise
    await notifyMovingDay();

    // Assertion
    expect(createManyNotifications).toHaveBeenCalledWith(tx, [
      { userId: 5, type: "MOVING_DAY", quotationRequestId: 100 },
    ]);
    expect(publishNotification).toHaveBeenCalledWith([5], { type: "MOVING_DAY" });
  });

  it("양쪽 모두 이미 보냈으면 아무것도 만들지 않는다", async () => {
    // Setup
    (mockedPrisma.quotationRequest.findMany as jest.Mock).mockResolvedValue([
      { id: 100, userId: 7, estimates: [{ moverId: 5 }] },
    ]);
    const tx = arrangeTransaction([{ userId: 7 }, { userId: 5 }]);

    // Exercise
    await notifyMovingDay();

    // Assertion — createManyNotifications가 빈 배열이면 DB를 건드리지 않습니다
    expect(createManyNotifications).toHaveBeenCalledWith(tx, []);
    expect(publishNotification).toHaveBeenCalledWith([], { type: "MOVING_DAY" });
  });

  it("확정 견적이 없으면 고객에게만 보낸다", async () => {
    // Setup — ASSIGNED인데 확정 견적이 없는 어긋난 데이터
    (mockedPrisma.quotationRequest.findMany as jest.Mock).mockResolvedValue([
      { id: 100, userId: 7, estimates: [] },
    ]);
    const tx = arrangeTransaction();

    // Exercise
    await notifyMovingDay();

    // Assertion
    expect(createManyNotifications).toHaveBeenCalledWith(tx, [
      { userId: 7, type: "MOVING_DAY", quotationRequestId: 100 },
    ]);
    expect(publishNotification).toHaveBeenCalledWith([7], { type: "MOVING_DAY" });
  });

  it("한 건이 실패해도 나머지를 계속 처리한다", async () => {
    // Setup
    (mockedPrisma.quotationRequest.findMany as jest.Mock).mockResolvedValue([
      { id: 100, userId: 7, estimates: [{ moverId: 5 }] },
      { id: 200, userId: 8, estimates: [{ moverId: 6 }] },
    ]);
    const tx = makeTx([]);
    (mockedPrisma.$transaction as unknown as jest.Mock)
      .mockRejectedValueOnce(new Error("연결 끊김"))
      .mockImplementationOnce((callback: (tx: unknown) => unknown) => callback(tx));

    // Exercise
    await notifyMovingDay();

    // Assertion — 두 번째 요청은 정상 처리됩니다
    expect(createManyNotifications).toHaveBeenCalledTimes(1);
    expect(createManyNotifications).toHaveBeenCalledWith(tx, [
      { userId: 8, type: "MOVING_DAY", quotationRequestId: 200 },
      { userId: 6, type: "MOVING_DAY", quotationRequestId: 200 },
    ]);
    expect(publishNotification).toHaveBeenCalledTimes(1);
    expect(publishNotification).toHaveBeenCalledWith([8, 6], { type: "MOVING_DAY" });
    expect(console.error).toHaveBeenCalled();
  });

  it("직렬화 충돌이면 다시 시도하고 성공한 신호만 보낸다", async () => {
    // Setup
    (mockedPrisma.quotationRequest.findMany as jest.Mock).mockResolvedValue([
      { id: 100, userId: 7, estimates: [{ moverId: 5 }] },
    ]);
    const tx = makeTx([]);
    (mockedPrisma.$transaction as unknown as jest.Mock)
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("직렬화 충돌", {
          code: "P2034",
          clientVersion: "test",
        })
      )
      .mockImplementationOnce((callback: (tx: unknown) => unknown) => callback(tx));

    // Exercise
    await notifyMovingDay();

    // Assertion — 롤백된 시도의 신호는 나가지 않습니다
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(createManyNotifications).toHaveBeenCalledTimes(1);
    expect(publishNotification).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });
});
