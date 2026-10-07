import { prisma } from "@/config/prisma";
import type { EstimateStatus } from "../../../generated/prisma/enums.ts";
import { createManyNotifications, createNotification } from "../notification/notification.service";
import { publishNotification } from "../notification/notification.sse";
import { balanceDueWhere, depositDueWhere, kstMonthRange, monthRange } from "./estimate.payment";
import estimateRepository from "./estimate.repository";

// 실제 DB는 쓰지 않고 트랜잭션 콜백만 직접 실행합니다.
// findMany는 조회 함수가 Prisma에 넘기는 where를 들여다보려고 함께 둡니다.
jest.mock("@/config/prisma", () => ({
  prisma: { $transaction: jest.fn(), estimate: { findMany: jest.fn() } },
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

jest.mock("../notification/notification.sse", () => ({
  publishNotification: jest.fn(),
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
    chatRoom: { create: jest.fn() },
    review: { upsert: jest.fn() },
    estimateExtraCharge: {
      aggregate: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
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

describe("estimateRepository.getAllByQuotationRequest", () => {
  const findMany = () => mockedPrisma.estimate.findMany as unknown as jest.Mock;

  /** Prisma에 실제로 넘어간 where를 꺼냅니다 */
  async function whereOf(estimateStatus?: EstimateStatus | EstimateStatus[]) {
    findMany().mockResolvedValue([]);
    await estimateRepository.getAllByQuotationRequest({ quotationRequestId: 27, estimateStatus });
    const calls = findMany().mock.calls;
    return calls[calls.length - 1]?.[0]?.where;
  }

  // 배열을 그대로 넘기면 Prisma가 거부합니다. { in: [...] }로 감싸야 합니다.
  // 타입만으로는 `notIn`처럼 의미가 정반대인 오타를 잡지 못해 값까지 확인합니다.
  test("상태 배열은 in 필터로 바뀐다", async () => {
    expect(await whereOf(["PENDING", "REJECTED"])).toEqual({
      quotationRequestId: 27,
      estimateStatus: { in: ["PENDING", "REJECTED"] },
    });
  });

  test("단일 상태는 그대로 넘어간다", async () => {
    expect(await whereOf("CONFIRMED")).toEqual({
      quotationRequestId: 27,
      estimateStatus: "CONFIRMED",
    });
  });

  test("상태를 안 주면 조건이 붙지 않는다", async () => {
    expect(await whereOf(undefined)).toEqual({ quotationRequestId: 27 });
  });
});

describe("estimateRepository.getAllByCustomer (#140)", () => {
  const findMany = () => mockedPrisma.estimate.findMany as unknown as jest.Mock;

  async function whereOf(
    params: Partial<Parameters<typeof estimateRepository.getAllByCustomer>[0]>
  ) {
    findMany().mockResolvedValue([]);
    await estimateRepository.getAllByCustomer({ userId: 7, ...params });
    const calls = findMany().mock.calls;
    return calls[calls.length - 1]?.[0]?.where;
  }

  // 요청 단위가 아니라 고객 기준이라, 남의 견적이 섞이지 않게 quotationRequest.userId로 묶어야 한다
  test("고객 본인의 견적만 조회한다", async () => {
    expect(await whereOf({})).toEqual({ quotationRequest: { userId: 7 } });
  });

  test("대기 중인 결제(DUE)는 선수금 대기 또는 잔금 대기로 거른다", async () => {
    expect(await whereOf({ paymentStage: "DUE" })).toEqual({
      quotationRequest: { userId: 7 },
      OR: [depositDueWhere, balanceDueWhere],
    });
  });

  test("결제 내역(PAID)은 잔금까지 결제한 견적으로 거른다", async () => {
    expect(await whereOf({ paymentStage: "PAID" })).toEqual({
      quotationRequest: { userId: 7 },
      paymentStatus: "PAID",
    });
  });
});

describe("estimateRepository.getAllByMover (#140)", () => {
  const findMany = () => mockedPrisma.estimate.findMany as unknown as jest.Mock;

  async function whereOf(params: Partial<Parameters<typeof estimateRepository.getAllByMover>[0]>) {
    findMany().mockResolvedValue([]);
    await estimateRepository.getAllByMover({ moverId: 9, ...params });
    const calls = findMany().mock.calls;
    return calls[calls.length - 1]?.[0]?.where;
  }

  // 기사님은 자기가 보낸 견적만 봐야 한다 — moverId 조건이 항상 붙는다
  test("기사님 본인의 견적만 조회한다", async () => {
    expect(await whereOf({})).toEqual({ moverId: 9 });
  });

  test("월별 조회는 이사일이 그 달인 견적만 거른다", async () => {
    expect(await whereOf({ month: "2026-10" })).toEqual({
      moverId: 9,
      quotationRequest: { movingDate: monthRange("2026-10") },
    });
  });

  test("결제 탭은 결제 단계로 거른다", async () => {
    expect(await whereOf({ paymentStage: "DUE" })).toEqual({
      moverId: 9,
      OR: [depositDueWhere, balanceDueWhere],
    });
    expect(await whereOf({ paymentStage: "PAID" })).toEqual({
      moverId: 9,
      paymentStatus: "PAID",
    });
  });
});

describe("estimateRepository.getAllByMover — 정렬 (#140)", () => {
  const findMany = () => mockedPrisma.estimate.findMany as unknown as jest.Mock;

  async function orderByOf(sort?: "latest" | "oldest") {
    findMany().mockResolvedValue([]);
    await estimateRepository.getAllByMover({ moverId: 9, sort });
    const calls = findMany().mock.calls;
    return calls[calls.length - 1]?.[0]?.orderBy;
  }

  // 카드에 보이는 이사 완료일(이사일) 기준이고, 같은 날은 id로 가린다
  test("기본은 최신순(이사일 내림차순, 같은 날은 id 내림차순)이다", async () => {
    const latest = [{ quotationRequest: { movingDate: "desc" } }, { id: "desc" }];
    expect(await orderByOf()).toEqual(latest);
    expect(await orderByOf("latest")).toEqual(latest);
  });

  test("오래된 순이면 이사일 오름차순이다", async () => {
    expect(await orderByOf("oldest")).toEqual([
      { quotationRequest: { movingDate: "asc" } },
      { id: "asc" },
    ]);
  });
});

describe("estimateRepository.getAllByMover — 결제 내역 정렬·월별 (#140)", () => {
  const findMany = () => mockedPrisma.estimate.findMany as unknown as jest.Mock;

  async function argOf(params: Partial<Parameters<typeof estimateRepository.getAllByMover>[0]>) {
    findMany().mockResolvedValue([]);
    await estimateRepository.getAllByMover({ moverId: 9, paymentStage: "PAID", ...params });
    const calls = findMany().mock.calls;
    return calls[calls.length - 1]?.[0];
  }

  // 결제 내역 카드에는 결제일이 보이므로 결제일 기준으로 정렬한다
  test("결제 내역은 결제일 순으로 정렬한다", async () => {
    expect((await argOf({})).orderBy).toEqual([{ paidAt: "desc" }, { id: "desc" }]);
    expect((await argOf({ sort: "oldest" })).orderBy).toEqual([{ paidAt: "asc" }, { id: "asc" }]);
  });

  test("결제 내역의 월별 조회는 결제한 달(KST)로 거른다", async () => {
    expect((await argOf({ month: "2026-10" })).where).toEqual({
      moverId: 9,
      paymentStatus: "PAID",
      paidAt: kstMonthRange("2026-10"),
    });
  });

  test("대기 중인 결제는 이사일 기준 그대로다", async () => {
    const arg = await argOf({ paymentStage: "DUE", month: "2026-10" });
    expect(arg.orderBy).toEqual([{ quotationRequest: { movingDate: "desc" } }, { id: "desc" }]);
    expect(arg.where.quotationRequest).toEqual({ movingDate: monthRange("2026-10") });
  });
});

describe("estimateRepository.getAllByCustomer — 정렬·월별 (#140)", () => {
  const findMany = () => mockedPrisma.estimate.findMany as unknown as jest.Mock;

  async function argOf(params: Partial<Parameters<typeof estimateRepository.getAllByCustomer>[0]>) {
    findMany().mockResolvedValue([]);
    await estimateRepository.getAllByCustomer({ userId: 7, ...params });
    const calls = findMany().mock.calls;
    return calls[calls.length - 1]?.[0];
  }

  test("결제 내역은 결제일 순으로 정렬한다", async () => {
    expect((await argOf({ paymentStage: "PAID" })).orderBy).toEqual([
      { paidAt: "desc" },
      { id: "desc" },
    ]);
    expect((await argOf({ paymentStage: "PAID", sort: "oldest" })).orderBy).toEqual([
      { paidAt: "asc" },
      { id: "asc" },
    ]);
  });

  test("월별 조회는 본인 조건을 덮어쓰지 않고 겹쳐서 건다", async () => {
    const arg = await argOf({ paymentStage: "PAID", month: "2026-10" });
    expect(arg.where.quotationRequest).toEqual({ userId: 7 });
    expect(arg.where.AND).toEqual([{ paidAt: kstMonthRange("2026-10") }]);
  });

  test("대기 중인 결제의 월별 조회는 이사일 기준이다", async () => {
    const arg = await argOf({ paymentStage: "DUE", month: "2026-10" });
    expect(arg.where.quotationRequest).toEqual({ userId: 7 });
    expect(arg.where.AND).toEqual([{ quotationRequest: { movingDate: monthRange("2026-10") } }]);
    expect(arg.orderBy).toEqual([{ quotationRequest: { movingDate: "desc" } }, { id: "desc" }]);
  });
});

describe("estimateRepository.requestPayment (#140)", () => {
  function arrange(count = 1) {
    tx.estimate.findUnique.mockResolvedValue({ quotationRequest: { userId: 7 } });
    tx.estimate.updateMany.mockResolvedValue({ count });
  }

  // 조건이 where에 있어야 동시 요청·결제 대상이 아닌 견적이 DB에서 걸러진다
  it("선수금 대기 또는 잔금 대기 + 미요청 견적에만 시각을 기록하고 고객에게 알린다", async () => {
    arrange();

    await estimateRepository.requestPayment(42);

    const arg = tx.estimate.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: 42,
      paymentRequestedAt: null,
      OR: [depositDueWhere, balanceDueWhere],
    });
    expect(arg.data.paymentRequestedAt).toBeInstanceOf(Date);
    expect(createNotification).toHaveBeenCalledWith(tx, {
      userId: 7,
      estimateId: 42,
      type: "PAYMENT_REQUEST",
    });
    expect(publishNotification).toHaveBeenCalledWith([7], { type: "PAYMENT_REQUEST" });
  });

  it("이미 요청했거나 요청할 수 없는 견적이면 알림 없이 409를 던진다", async () => {
    arrange(0);

    await expect(estimateRepository.requestPayment(42)).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYMENT_REQUEST_ALREADY_SENT",
    });
    expect(createNotification).not.toHaveBeenCalled();
    expect(publishNotification).not.toHaveBeenCalled();
  });

  it("없는 견적이면 404를 던진다", async () => {
    tx.estimate.findUnique.mockResolvedValue(null);

    await expect(estimateRepository.requestPayment(42)).rejects.toMatchObject({ statusCode: 404 });
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("estimateRepository.payDeposit (#140)", () => {
  function arrange(count = 1) {
    tx.estimate.updateMany.mockResolvedValue({ count });
    tx.estimate.findUniqueOrThrow.mockResolvedValue({
      moverId: 9,
      quotationRequest: { userId: 7 },
    });
  }

  it("선수금 대기 + 기한 안일 때만 기록하고 기사님에게 알린다", async () => {
    arrange();

    expect(await estimateRepository.payDeposit(5, "pk_dep")).toBe(true);

    const arg = tx.estimate.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: 5, ...depositDueWhere });
    // 기한이 지난 선수금은 DB 조건에서 걸러져야 한다
    expect(arg.where.depositDueAt.gte).toBeInstanceOf(Date);
    expect(arg.data.depositPaidAt).toBeInstanceOf(Date);
    expect(arg.data.depositPaymentKey).toBe("pk_dep");
    // 선수금을 냈으니 보낸 결제 요청은 지워 잔금 때 다시 보낼 수 있게 한다
    expect(arg.data.paymentRequestedAt).toBeNull();
    // 채팅방은 확정할 때 이미 열려 있어 여기서 만들지 않는다
    expect(tx.chatRoom.create).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(tx, {
      userId: 9,
      estimateId: 5,
      type: "DEPOSIT_PAID",
    });
    expect(publishNotification).toHaveBeenCalledWith([9], { type: "DEPOSIT_PAID" });
  });

  it("조건에 맞는 행이 없으면(기한 지남·이미 결제) false를 돌려주고 채팅방·알림을 만들지 않는다", async () => {
    arrange(0);

    expect(await estimateRepository.payDeposit(5, "pk_dep")).toBe(false);
    expect(tx.chatRoom.create).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(publishNotification).not.toHaveBeenCalled();
  });
});

describe("estimateRepository.proposeExtraCharge (#140)", () => {
  const input = { amount: 30000, reason: "계단 이동이 많아 추가 인력이 필요했습니다" };
  const MAX = 36000;

  function arrange(count = 1, existingSum: number | null = null) {
    tx.estimate.updateMany.mockResolvedValue({ count });
    tx.estimateExtraCharge.aggregate.mockResolvedValue({ _sum: { amount: existingSum } });
    tx.estimateExtraCharge.create.mockResolvedValue({});
    tx.estimate.findUniqueOrThrow.mockResolvedValue({ quotationRequest: { userId: 7 } });
  }

  // 잔금 대기 조건이 where에 있어야 결제 끝난 견적이 DB에서 걸러진다 (같은 갱신이 견적 행을 잠근다)
  it("잔금 대기 견적에 한 건을 추가하고 고객에게 알린다", async () => {
    arrange();

    await estimateRepository.proposeExtraCharge(42, input, MAX);

    expect(tx.estimate.updateMany.mock.calls[0][0].where).toEqual({ id: 42, ...balanceDueWhere });
    expect(tx.estimateExtraCharge.create).toHaveBeenCalledWith({
      data: { estimateId: 42, amount: 30000, reason: input.reason },
    });
    expect(createNotification).toHaveBeenCalledWith(tx, {
      userId: 7,
      estimateId: 42,
      type: "EXTRA_CHARGE_PROPOSED",
    });
    expect(publishNotification).toHaveBeenCalledWith([7], { type: "EXTRA_CHARGE_PROPOSED" });
  });

  it("이미 보낸 건이 있어도 합계가 상한 이내면 추가할 수 있다", async () => {
    arrange(1, 6000);

    await estimateRepository.proposeExtraCharge(42, { ...input, amount: 30000 }, MAX);

    expect(tx.estimateExtraCharge.aggregate.mock.calls[0][0].where).toEqual({
      estimateId: 42,
      status: { in: ["PROPOSED", "APPROVED"] },
    });
    expect(tx.estimateExtraCharge.create).toHaveBeenCalled();
  });

  it("거절되지 않은 건과 합쳐 상한을 넘으면 알림 없이 400을 던진다", async () => {
    arrange(1, 6010);

    await expect(estimateRepository.proposeExtraCharge(42, input, MAX)).rejects.toMatchObject({
      statusCode: 400,
      code: "EXTRA_CHARGE_TOO_LARGE",
    });
    expect(tx.estimateExtraCharge.create).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("잔금 대기 단계가 아니면 알림 없이 400을 던진다", async () => {
    arrange(0);

    await expect(estimateRepository.proposeExtraCharge(42, input, MAX)).rejects.toMatchObject({
      statusCode: 400,
      code: "ESTIMATE_NOT_COMPLETED",
    });
    expect(tx.estimateExtraCharge.create).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(publishNotification).not.toHaveBeenCalled();
  });
});

describe("estimateRepository.updateExtraCharge (#140)", () => {
  const input = { amount: 20000, reason: "수정한 사유" };
  const MAX = 36000;

  function arrange({ locked = 1, othersSum = 0, updated = 1 } = {}) {
    tx.estimate.updateMany.mockResolvedValue({ count: locked });
    tx.estimateExtraCharge.aggregate.mockResolvedValue({ _sum: { amount: othersSum } });
    tx.estimateExtraCharge.updateMany.mockResolvedValue({ count: updated });
  }

  it("응답 대기(PROPOSED) 건의 금액·사유만 고치고 알림은 보내지 않는다", async () => {
    arrange();

    await estimateRepository.updateExtraCharge(42, 3, input, MAX);

    expect(tx.estimateExtraCharge.aggregate.mock.calls[0][0].where).toEqual({
      estimateId: 42,
      id: { not: 3 },
      status: { in: ["PROPOSED", "APPROVED"] },
    });
    expect(tx.estimateExtraCharge.updateMany).toHaveBeenCalledWith({
      where: { id: 3, estimateId: 42, status: "PROPOSED" },
      data: { amount: 20000, reason: "수정한 사유" },
    });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("다른 건과 합쳐 상한을 넘으면 400을 던지고 고치지 않는다", async () => {
    arrange({ othersSum: 16010 });

    await expect(estimateRepository.updateExtraCharge(42, 3, input, MAX)).rejects.toMatchObject({
      code: "EXTRA_CHARGE_TOO_LARGE",
    });
    expect(tx.estimateExtraCharge.updateMany).not.toHaveBeenCalled();
  });

  it("이미 응답했거나 없는 건이면 400(EXTRA_CHARGE_NOT_PENDING)", async () => {
    arrange({ updated: 0 });

    await expect(estimateRepository.updateExtraCharge(42, 3, input, MAX)).rejects.toMatchObject({
      statusCode: 400,
      code: "EXTRA_CHARGE_NOT_PENDING",
    });
  });

  it("잔금 대기 단계가 아니면 400을 던진다", async () => {
    arrange({ locked: 0 });

    await expect(estimateRepository.updateExtraCharge(42, 3, input, MAX)).rejects.toMatchObject({
      code: "ESTIMATE_NOT_COMPLETED",
    });
    expect(tx.estimateExtraCharge.updateMany).not.toHaveBeenCalled();
  });
});

describe("estimateRepository.respondExtraCharges (#140)", () => {
  function arrange(count = 2) {
    tx.estimateExtraCharge.updateMany.mockResolvedValue({ count });
    tx.estimate.findUniqueOrThrow.mockResolvedValue({ moverId: 9 });
  }

  it("고른 응답 대기 건을 한 번에 승인하고 기사님에게 알림 1건을 보낸다", async () => {
    arrange(2);

    await estimateRepository.respondExtraCharges(42, [3, 4], "APPROVED");

    const arg = tx.estimateExtraCharge.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: { in: [3, 4] },
      estimateId: 42,
      status: "PROPOSED",
      estimate: balanceDueWhere,
    });
    expect(arg.data).toMatchObject({ status: "APPROVED" });
    expect(arg.data.respondedAt).toBeInstanceOf(Date);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(tx, {
      userId: 9,
      estimateId: 42,
      type: "EXTRA_CHARGE_RESPONDED",
    });
    expect(publishNotification).toHaveBeenCalledWith([9], { type: "EXTRA_CHARGE_RESPONDED" });
  });

  it("거절도 같은 조건으로 기록한다", async () => {
    arrange(1);

    await estimateRepository.respondExtraCharges(42, [3], "REJECTED");

    expect(tx.estimateExtraCharge.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "REJECTED",
    });
  });

  // 일부만 바뀌면 트랜잭션을 되돌려 "전부 아니면 전무"로 맞춘다
  it("고른 건 중 하나라도 응답할 수 없으면(이미 응답함 등) 알림 없이 400을 던진다", async () => {
    arrange(1);

    await expect(
      estimateRepository.respondExtraCharges(42, [3, 4], "APPROVED")
    ).rejects.toMatchObject({ statusCode: 400, code: "EXTRA_CHARGE_NOT_PENDING" });
    expect(createNotification).not.toHaveBeenCalled();
    expect(publishNotification).not.toHaveBeenCalled();
  });
});

describe("estimateRepository.pay (#140)", () => {
  // 잔금 대기 조건이 where에 있어야 동시 결제·선수금 미납·미완료 견적이 DB에서 걸러진다
  it("잔금 대기 견적만 PAID로 바꾸고 리뷰를 열고 기사님에게 알린다", async () => {
    tx.estimate.updateMany.mockResolvedValue({ count: 1 });
    tx.estimate.findUniqueOrThrow.mockResolvedValue({
      moverId: 9,
      quotationRequest: { userId: 7 },
    });

    expect(await estimateRepository.pay(5, "pk_test_1")).toBe(true);

    const arg = tx.estimate.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 5, ...balanceDueWhere });
    expect(arg.data.paymentStatus).toBe("PAID");
    expect(arg.data.paymentKey).toBe("pk_test_1");
    expect(arg.data.paidAt).toBeInstanceOf(Date);
    // 결제하면 작성 가능한 리뷰가 열린다 (이미 있으면 그대로 둔다)
    expect(tx.review.upsert).toHaveBeenCalledWith({
      where: { estimateId: 5 },
      create: { estimateId: 5, customerId: 7, status: "PENDING" },
      update: {},
    });
    expect(createNotification).toHaveBeenCalledWith(tx, {
      userId: 9,
      estimateId: 5,
      type: "PAYMENT_COMPLETED",
    });
    expect(publishNotification).toHaveBeenCalledWith([9], { type: "PAYMENT_COMPLETED" });
  });

  it("조건에 맞는 행이 없으면 false를 돌려주고 알림을 만들지 않는다", async () => {
    tx.estimate.updateMany.mockResolvedValue({ count: 0 });

    expect(await estimateRepository.pay(5, "pk_test_1")).toBe(false);
    expect(tx.review.upsert).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    expect(publishNotification).not.toHaveBeenCalled();
  });
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
    expect(publishNotification).toHaveBeenCalledWith([7], { type: "NEW_ESTIMATE" });
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
    expect(publishNotification).not.toHaveBeenCalled();
  });
});

describe("estimateRepository.confirm", () => {
  /** 확정이 끝까지 통과하는 상태 */
  function arrangeConfirmSuccess() {
    tx.estimate.findUnique.mockResolvedValue({
      price: 180000,
      quotationRequestId: 100,
      quotationRequest: { userId: 7, movingDate: new Date("2099-12-31") },
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
    expect(publishNotification).toHaveBeenCalledWith([5, 7], { type: "ESTIMATE_CONFIRMED" });
  });

  // 선수금을 내기 전에도 대화할 수 있게 확정하면 바로 연다. 못 내면 expireDeposits가 닫는다
  it("확정하면 고객·기사님 채팅방을 바로 연다", async () => {
    arrangeConfirmSuccess();

    await estimateRepository.confirm(42, 5);

    expect(tx.chatRoom.create).toHaveBeenCalledWith({
      data: { estimateId: 42, customerId: 7, moverId: 5 },
    });
  });

  it("확정하면 선수금(견적의 10%)과 결제 기한을 함께 기록한다", async () => {
    arrangeConfirmSuccess();

    await estimateRepository.confirm(42, 5);

    const arg = tx.estimate.updateMany.mock.calls[0][0];
    expect(arg.data.estimateStatus).toBe("CONFIRMED");
    expect(arg.data.depositAmount).toBe(18000);
    expect(arg.data.depositDueAt).toBeInstanceOf(Date);
  });

  it("이미 처리된 견적이면 알림과 채팅방을 만들지 않는다", async () => {
    // Setup — 동시에 두 번 확정하면 조건부 갱신에서 count가 0이 됩니다
    arrangeConfirmSuccess();
    tx.estimate.updateMany.mockResolvedValue({ count: 0 });

    // Exercise + Assertion
    await expect(estimateRepository.confirm(42, 5)).rejects.toMatchObject({
      code: "ESTIMATE_ALREADY_PROCESSED",
    });
    expect(createManyNotifications).not.toHaveBeenCalled();
    expect(tx.chatRoom.create).not.toHaveBeenCalled();
    expect(publishNotification).not.toHaveBeenCalled();
  });

  it("없는 견적이면 404를 던진다", async () => {
    // Setup
    tx.estimate.findUnique.mockResolvedValue(null);

    // Exercise + Assertion
    await expect(estimateRepository.confirm(42, 5)).rejects.toMatchObject({ statusCode: 404 });
    expect(createManyNotifications).not.toHaveBeenCalled();
  });
});
