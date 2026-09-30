import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import * as repository from "./quotation-request.repository";
import * as service from "./quotation-request.service";
import { createManyNotifications, createNotification } from "../notification/notification.service";
import { publishNotification } from "../notification/notification.sse";

// service.ts가 create()에서 prisma를 직접 import합니다.
// 끊어주지 않으면 generated/prisma/client.ts까지 끌고 가 모듈을 못 찾습니다.
// create() 테스트는 트랜잭션 콜백을 직접 실행해야 하므로 $transaction만 흉내 냅니다.
jest.mock("@/config/prisma", () => ({
  prisma: {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(fakeTx)),
  },
}));

// 네임스페이스 import라 팩토리에 함수를 직접 나열합니다 (favorite과 다른 점)
jest.mock("./quotation-request.repository", () => ({
  findActiveByUserId: jest.fn(),
  findById: jest.fn(),
  findMoverById: jest.fn(),
  findMoverIdsByRegionAndService: jest.fn(),
  save: jest.fn(),
  saveTargetedRequest: jest.fn(),
}));

// 알림은 트랜잭션 콜백 안에서 호출됩니다 - 여기선 호출 여부만 봅니다
jest.mock("../notification/notification.service", () => ({
  createNotification: jest.fn(),
  createManyNotifications: jest.fn(),
}));

jest.mock("../notification/notification.sse", () => ({
  publishNotification: jest.fn(),
}));

/** 실제 트랜잭션은 필요 없습니다 — 그대로 전달되는지만 봅니다 */
const fakeTx = {} as never;

const mockedRepository = jest.mocked(repository);

/** findById가 돌려주는 요청. 기본은 본인 (userId=1) 소유의 활성 요청 */
function makeRequest(overrides = {}) {
  return {
    id: 100,
    userId: 1,
    quotationStatus: "PENDING",
    ...overrides,
  };
}

describe("create", () => {
  /** 서울 출발 소형이사 요청 */
  const input = {
    userId: 1,
    category: "SMALL" as const,
    movingDate: new Date("2026-10-01T00:00:00.000Z"),
    from: { postalCode: "06234", region: "SEOUL" as const, address: "서울", detailAddress: "1층" },
    to: { postalCode: "10401", region: "GYEONGGI" as const, address: "경기", detailAddress: "2층" },
  };

  beforeEach(() => jest.clearAllMocks());

  it("활성 요청이 있으면 ACTIVE_REQUEST_EXISTS", async () => {
    mockedRepository.findActiveByUserId.mockResolvedValue({ id: 100 } as never);

    await expect(service.create(input)).rejects.toMatchObject({
      code: ERROR_CODES.ACTIVE_REQUEST_EXISTS,
    });
    expect(mockedRepository.save).not.toHaveBeenCalled();
  });

  it("출발지 지역과 이사 유형이 모두 맞는 기사님에게만 알림 대상을 조회한다", async () => {
    mockedRepository.findActiveByUserId.mockResolvedValue(null as never);
    mockedRepository.save.mockResolvedValue({ id: 100 } as never);
    mockedRepository.findMoverIdsByRegionAndService.mockResolvedValue([5, 6] as never);

    await service.create(input);

    // 지역만 보면 소형이사를 안 하는 기사님에게도 알림이 갑니다
    expect(mockedRepository.findMoverIdsByRegionAndService).toHaveBeenCalledWith(
      "SEOUL",
      "SMALL",
      fakeTx
    );
  });

  it("대상 기사님 전원에게 알림을 한 번에 생성한다", async () => {
    mockedRepository.findActiveByUserId.mockResolvedValue(null as never);
    mockedRepository.save.mockResolvedValue({ id: 100 } as never);
    mockedRepository.findMoverIdsByRegionAndService.mockResolvedValue([5, 6] as never);

    await service.create(input);

    expect(createManyNotifications).toHaveBeenCalledWith(fakeTx, [
      { userId: 5, type: "NEW_REQUEST", quotationRequestId: 100 },
      { userId: 6, type: "NEW_REQUEST", quotationRequestId: 100 },
    ]);
    expect(publishNotification).toHaveBeenCalledWith([5, 6], { type: "NEW_REQUEST" });
  });

  it("조건에 맞는 기사님이 없어도 요청 생성은 성공한다", async () => {
    mockedRepository.findActiveByUserId.mockResolvedValue(null as never);
    mockedRepository.save.mockResolvedValue({ id: 100 } as never);
    mockedRepository.findMoverIdsByRegionAndService.mockResolvedValue([] as never);

    const result = await service.create(input);

    expect(result).toEqual({ id: 100 });
    expect(createManyNotifications).toHaveBeenCalledWith(fakeTx, []);
    expect(publishNotification).toHaveBeenCalledWith([], { type: "NEW_REQUEST" });
  });
});

describe("createTargetedRequest", () => {
  beforeEach(() => jest.clearAllMocks());

  it("요청이 없으면 404", async () => {
    mockedRepository.findById.mockResolvedValue(null as never);

    await expect(service.createTargetedRequest(100, 1, 5)).rejects.toThrow(AppError);
    expect(mockedRepository.saveTargetedRequest).not.toHaveBeenCalled();
  });

  it("본인 요청이 아니면 403", async () => {
    mockedRepository.findById.mockResolvedValue(makeRequest({ userId: 999 }) as never);

    await expect(service.createTargetedRequest(100, 1, 5)).rejects.toThrow(AppError);
    expect(mockedRepository.saveTargetedRequest).not.toHaveBeenCalled();
  });

  it("이미 종료된 요청이면 NO_ACTIVE_REQUEST", async () => {
    mockedRepository.findById.mockResolvedValue(
      makeRequest({ quotationStatus: "COMPLETED" }) as never
    );

    await expect(service.createTargetedRequest(100, 1, 5)).rejects.toMatchObject({
      code: ERROR_CODES.NO_ACTIVE_REQUEST,
    });
  });
  it("지정 대상이 기사님이 아니면 404", async () => {
    mockedRepository.findById.mockResolvedValue(makeRequest() as never);
    mockedRepository.findMoverById.mockResolvedValue(null as never);

    await expect(service.createTargetedRequest(100, 1, 5)).rejects.toThrow(AppError);
    expect(mockedRepository.saveTargetedRequest).not.toHaveBeenCalled();
  });

  // 1차 QA #7 — ASSIGNED는 "기사님 확정, 이사 전"이라 스키마 주석상 활성이지만
  // 이미 기사님이 정해진 요청에 새 지정이 들어가면 안 됩니다.
  it("이미 기사님이 확정된(ASSIGNED) 요청이면 NO_ACTIVE_REQUEST", async () => {
    mockedRepository.findById.mockResolvedValue(
      makeRequest({ quotationStatus: "ASSIGNED" }) as never
    );

    await expect(service.createTargetedRequest(100, 1, 5)).rejects.toMatchObject({
      code: ERROR_CODES.NO_ACTIVE_REQUEST,
    });
    expect(mockedRepository.saveTargetedRequest).not.toHaveBeenCalled();
  });

  it("정상이면 지정 요청을 생성하고 알림 콜백을 넘긴다", async () => {
    mockedRepository.findById.mockResolvedValue(makeRequest() as never);
    mockedRepository.findMoverById.mockResolvedValue({ id: 5 } as never);
    mockedRepository.saveTargetedRequest.mockResolvedValue({ id: 1 } as never);

    await service.createTargetedRequest(100, 1, 5);

    expect(mockedRepository.saveTargetedRequest).toHaveBeenCalledWith(100, 5, expect.any(Function));

    // saveTargetedRequest가 mock이라 콜백이 자동 실행되지 않습니다.
    // 세 번째 인자를 꺼내 직접 호출해 알림이 불리는지 확인합니다.
    const onCreated = mockedRepository.saveTargetedRequest.mock.calls[0][2];
    const fakeTx = {} as never;
    await onCreated(fakeTx, 1);

    expect(createNotification).toHaveBeenCalledWith(fakeTx, {
      userId: 5,
      type: "NEW_REQUEST",
      quotationRequestId: 100,
    });
    expect(publishNotification).toHaveBeenCalledWith([5], { type: "NEW_REQUEST" });
  });
});
