import { prisma } from "@/config/prisma";
import { createManyNotifications, createNotification } from "../notification/notification.service";
import estimateRepository from "./estimate.repository";

// 실제 DB는 쓰지 않고 트랜잭션 콜백만 직접 실행합니다
jest.mock("@/config/prisma", () => ({
  prisma: { $transaction: jest.fn() },
}));

// repository가 재시도 판정에 쓰는 Prisma 네임스페이스만 대신합니다.
// 실제 generated client를 로드하면 내부 상대 import(.ts)까지 따라가 해석이 깨집니다.
jest.mock("../../../generated/prisma/client.ts", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
  },
}));

jest.mock("../notification/notification.service", () => ({
  createNotification: jest.fn(),
  createManyNotifications: jest.fn(),
}));

const mockedPrisma = jest.mocked(prisma);

/** repository가 트랜잭션 안에서 부르는 메서드만 갖춘 가짜 tx */
function makeTx() {
  return {
    estimate: {
      create: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    quotationRequest: {
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    targetedRequest: { findMany: jest.fn() },
    moverProfile: { update: jest.fn() },
  };
}

type FakeTx = ReturnType<typeof makeTx>;

let tx: FakeTx;

beforeEach(() => {
  jest.clearAllMocks();
  tx = makeTx();
  // $transaction(cb) / $transaction(cb, options) 둘 다 콜백만 실행합니다
  (mockedPrisma.$transaction as unknown as jest.Mock).mockImplementation(
    (callback: (tx: FakeTx) => unknown) => callback(tx)
  );
});

describe("estimateRepository.save", () => {
  it("일반 견적을 저장하고 요청 고객에게 NEW_ESTIMATE 알림을 보낸다", async () => {
    // Setup
    tx.targetedRequest.findMany.mockResolvedValue([]);
    tx.estimate.count.mockResolvedValue(0);
    tx.estimate.create.mockResolvedValue({ id: 30 });
    tx.quotationRequest.findUniqueOrThrow.mockResolvedValue({ userId: 7 });

    // Exercise
    const result = await estimateRepository.save(
      { quotationRequestId: 100, moverId: 5, price: 210000, comment: "가능합니다" },
      false
    );

    // Assertion
    expect(result).toEqual({ id: 30 });
    expect(createNotification).toHaveBeenCalledWith(tx, {
      userId: 7,
      estimateId: 30,
      type: "NEW_ESTIMATE",
    });
  });

  it("지정 견적도 같은 알림을 보낸다 (상한 체크만 건너뛴다)", async () => {
    // Setup
    tx.estimate.create.mockResolvedValue({ id: 31 });
    tx.quotationRequest.findUniqueOrThrow.mockResolvedValue({ userId: 7 });

    // Exercise
    await estimateRepository.save(
      { quotationRequestId: 100, moverId: 5, price: 210000, comment: "가능합니다" },
      true
    );

    // Assertion
    expect(tx.estimate.count).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(tx, {
      userId: 7,
      estimateId: 31,
      type: "NEW_ESTIMATE",
    });
  });

  it("일반 견적이 이미 5건이면 알림 없이 실패한다", async () => {
    // Setup
    tx.targetedRequest.findMany.mockResolvedValue([]);
    tx.estimate.count.mockResolvedValue(5);

    // Exercise + Assertion
    await expect(
      estimateRepository.save(
        { quotationRequestId: 100, moverId: 5, price: 210000, comment: "가능합니다" },
        false
      )
    ).rejects.toMatchObject({ code: "ESTIMATE_LIMIT_EXCEEDED" });
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("estimateRepository.confirm", () => {
  /** 확정이 끝까지 통과하는 상태 */
  function arrangeConfirmSuccess() {
    tx.estimate.findUnique.mockResolvedValue({
      quotationRequestId: 100,
      quotationRequest: { userId: 7 },
    });
    tx.estimate.updateMany.mockResolvedValue({ count: 1 });
    tx.quotationRequest.updateMany.mockResolvedValue({ count: 1 });
    tx.moverProfile.update.mockResolvedValue({});
    tx.estimate.findUniqueOrThrow.mockResolvedValue({ id: 42 });
  }

  it("기사님과 고객 양쪽에 확정 알림을 한 번에 생성한다", async () => {
    // Setup
    arrangeConfirmSuccess();

    // Exercise
    const result = await estimateRepository.confirm(42, 5);

    // Assertion
    expect(result).toEqual({ id: 42 });
    expect(createManyNotifications).toHaveBeenCalledWith(tx, [
      { userId: 5, estimateId: 42, type: "ESTIMATE_CONFIRMED" },
      { userId: 7, estimateId: 42, type: "ESTIMATE_CONFIRMED" },
    ]);
  });

  it("이미 처리된 견적이면 알림을 만들지 않는다", async () => {
    // Setup — 동시에 두 번 확정하면 조건부 갱신에서 count가 0이 됩니다
    arrangeConfirmSuccess();
    tx.estimate.updateMany.mockResolvedValue({ count: 0 });

    // Exercise + Assertion
    await expect(estimateRepository.confirm(42, 5)).rejects.toMatchObject({
      code: "ESTIMATE_ALREADY_PROCESSED",
    });
    expect(createManyNotifications).not.toHaveBeenCalled();
  });

  it("없는 견적이면 404를 던진다", async () => {
    // Setup
    tx.estimate.findUnique.mockResolvedValue(null);

    // Exercise + Assertion
    await expect(estimateRepository.confirm(42, 5)).rejects.toMatchObject({ statusCode: 404 });
    expect(createManyNotifications).not.toHaveBeenCalled();
  });
});
