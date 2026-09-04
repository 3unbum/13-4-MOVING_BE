import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import * as repository from "./quotation-request.repository";
import * as service from "./quotation-request.service";
import { createNotification } from "../notification/notification.service";

// service.ts가 create()에서 prisma를 직접 import합니다.
// 끊어주지 않으면 generated/prisma/client.ts까지 끌고 가 모듈을 못 찾습니다.
jest.mock("@/config/prisma", () => ({
  prisma: {},
}));

// 네임스페이스 import라 팩토리에 함수를 직접 나열합니다 (favorite과 다른 점)
jest.mock("./quotation-request.repository", () => ({
  findById: jest.fn(),
  findMoverById: jest.fn(),
  saveTargetedRequest: jest.fn(),
}));

// 알림은 트랜잭션 콜백 안에서 호출됩니다 - 여기선 호출 여부만 봅니다
jest.mock("../notification/notification.service", () => ({
  createNotification: jest.fn(),
}));

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

  it("ASSIGNED 요청에도 지정할 수 있다", async () => {
    mockedRepository.findById.mockResolvedValue(
      makeRequest({ quotationStatus: "ASSIGNED" }) as never
    );
    mockedRepository.findMoverById.mockResolvedValue({ id: 5 } as never);
    mockedRepository.saveTargetedRequest.mockResolvedValue({ id: 1 } as never);

    await expect(service.createTargetedRequest(100, 1, 5)).resolves.toBeDefined();
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
  });
});
