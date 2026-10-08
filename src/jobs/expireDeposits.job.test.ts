import { prisma } from "@/config/prisma";
import { depositDueWhere } from "@/modules/estimate/estimate.payment";
import { createManyNotifications } from "@/modules/notification/notification.service";
import { publishNotification } from "@/modules/notification/notification.sse";
import { expireDeposits } from "./expireDeposits.job";

// 테스트가 실제로 크론을 걸지 않도록 끊습니다
jest.mock("node-cron", () => ({ schedule: jest.fn() }));

jest.mock("@/config/prisma", () => ({
  prisma: {
    estimate: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/modules/notification/notification.service", () => ({
  createManyNotifications: jest.fn(),
}));

jest.mock("@/modules/notification/notification.sse", () => ({
  publishNotification: jest.fn(),
}));

const mockedPrisma = jest.mocked(prisma);

/** 견적 한 건을 취소할 때 쓰는 메서드만 갖춘 가짜 tx */
function makeTx(updateCount = 1) {
  return {
    estimate: { updateMany: jest.fn().mockResolvedValue({ count: updateCount }) },
    quotationRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    moverProfile: { update: jest.fn().mockResolvedValue({}) },
  };
}

const target = (id: number) => ({
  id,
  moverId: 9,
  quotationRequestId: 100 + id,
  quotationRequest: { userId: 7 },
});

const findMany = () => mockedPrisma.estimate.findMany as unknown as jest.Mock;
const transaction = () => mockedPrisma.$transaction as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe("expireDeposits", () => {
  const now = new Date("2026-10-10T00:00:00Z");

  it("기한이 지난 선수금 대기 견적만 찾는다", async () => {
    findMany().mockResolvedValue([]);

    await expireDeposits(now);

    expect(findMany().mock.calls[0][0].where).toEqual({
      ...depositDueWhere,
      depositDueAt: { lt: now },
    });
    expect(transaction()).not.toHaveBeenCalled();
  });

  it("확정을 취소하고 요청을 되돌리고 확정 수를 줄이고 양쪽에 알린다", async () => {
    const tx = makeTx();
    findMany().mockResolvedValue([target(1)]);
    transaction().mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

    await expireDeposits(now);

    // 견적은 PENDING으로 돌아가고 선수금 필드는 초기화된다 (다른 견적을 다시 확정할 수 있게)
    const update = tx.estimate.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({ id: 1, ...depositDueWhere });
    expect(update.data).toEqual({
      estimateStatus: "PENDING",
      depositAmount: null,
      depositDueAt: null,
      paymentRequestedAt: null,
    });
    expect(tx.quotationRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 101, quotationStatus: "ASSIGNED" },
      data: { quotationStatus: "PENDING" },
    });
    expect(tx.moverProfile.update).toHaveBeenCalledWith({
      where: { userId: 9 },
      data: { confirmedCount: { decrement: 1 } },
    });
    expect(createManyNotifications).toHaveBeenCalledWith(tx, [
      { userId: 7, estimateId: 1, type: "DEPOSIT_EXPIRED" },
      { userId: 9, estimateId: 1, type: "DEPOSIT_EXPIRED" },
    ]);
    expect(publishNotification).toHaveBeenCalledWith([7, 9], { type: "DEPOSIT_EXPIRED" });
  });

  // 조회와 갱신 사이에 선수금이 결제되면 같은 조건의 갱신이 0건이 되어야 한다
  it("그사이 선수금이 결제됐으면(갱신 0건) 건드리지 않고 알림도 보내지 않는다", async () => {
    const tx = makeTx(0);
    findMany().mockResolvedValue([target(1)]);
    transaction().mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

    await expireDeposits(now);

    expect(tx.quotationRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.moverProfile.update).not.toHaveBeenCalled();
    expect(createManyNotifications).not.toHaveBeenCalled();
    expect(publishNotification).not.toHaveBeenCalled();
  });

  it("한 건이 실패해도 나머지는 계속 처리한다", async () => {
    const tx = makeTx();
    findMany().mockResolvedValue([target(1), target(2)]);
    transaction()
      .mockRejectedValueOnce(new Error("DB 오류"))
      .mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

    await expireDeposits(now);

    expect(tx.estimate.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.estimate.updateMany.mock.calls[0][0].where).toMatchObject({ id: 2 });
  });
});
