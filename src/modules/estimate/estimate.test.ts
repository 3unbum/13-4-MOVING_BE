import { ERROR_CODES } from "@/common/errors/errorCodes";
import { prisma } from "@/config/prisma";
import estimateRepository from "./estimate.repository";
import * as estimateService from "./estimate.service";

jest.mock("./estimate.repository", () => ({
  __esModule: true,
  default: {
    getAllByQuotationRequest: jest.fn(),
    getById: jest.fn(),
    reject: jest.fn(),
    save: jest.fn(),
    confirm: jest.fn(),
  },
}));

jest.mock("@/config/prisma", () => ({
  prisma: {
    quotationRequest: { findUnique: jest.fn(), findFirst: jest.fn() },
    targetedRequest: { findUnique: jest.fn() },
  },
}));

const mockedRepository = jest.mocked(estimateRepository);
const mockedPrisma = prisma as unknown as {
  quotationRequest: { findUnique: jest.Mock; findFirst: jest.Mock };
  targetedRequest: { findUnique: jest.Mock };
};

beforeEach(() => jest.clearAllMocks());

describe("getQuotationEstimates", () => {
  test("요청이 없으면 404를 던진다", async () => {
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue(null as never);

    await expect(estimateService.getQuotationEstimates(1, 27, {})).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test("본인 요청이 아니면 403을 던진다", async () => {
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({ userId: 2 } as never);

    await expect(estimateService.getQuotationEstimates(1, 27, {})).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("본인 요청이면 repository에 위임한다", async () => {
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({ userId: 1 } as never);
    mockedRepository.getAllByQuotationRequest.mockResolvedValue([] as never);

    const result = await estimateService.getQuotationEstimates(1, 27, { take: 4 });

    expect(mockedRepository.getAllByQuotationRequest).toHaveBeenCalledWith({
      quotationRequestId: 27,
      estimateStatus: undefined,
      cursor: undefined,
      take: 4,
    });
    expect(result).toEqual([]);
  });
});

describe("getPendingEstimates", () => {
  test("활성 요청이 없으면 빈 배열을 반환한다", async () => {
    mockedPrisma.quotationRequest.findFirst.mockResolvedValue(null as never);

    const result = await estimateService.getPendingEstimates(1, {});

    expect(result).toEqual([]);
    expect(mockedRepository.getAllByQuotationRequest).not.toHaveBeenCalled();
  });

  test("활성 요청이 있으면 PENDING 견적만 조회한다", async () => {
    mockedPrisma.quotationRequest.findFirst.mockResolvedValue({ id: 27 } as never);
    mockedRepository.getAllByQuotationRequest.mockResolvedValue([] as never);

    await estimateService.getPendingEstimates(1, {});

    expect(mockedRepository.getAllByQuotationRequest).toHaveBeenCalledWith({
      quotationRequestId: 27,
      estimateStatus: "PENDING",
      cursor: undefined,
      take: undefined,
    });
  });
});

describe("getById", () => {
  test("견적이 없으면 404를 던진다", async () => {
    mockedRepository.getById.mockResolvedValue(null);

    await expect(estimateService.getById(1, 1, "CUSTOMER")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test("mover 본인 견적이 아니면 403을 던진다", async () => {
    mockedRepository.getById.mockResolvedValue({ moverId: 2 } as never);

    await expect(estimateService.getById(1, 1, "MOVER")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("mover 본인 견적이면 반환한다", async () => {
    const estimate = { moverId: 1 };
    mockedRepository.getById.mockResolvedValue(estimate as never);

    const result = await estimateService.getById(1, 1, "MOVER");

    expect(result).toBe(estimate);
  });

  test("customer 본인 요청이 아니면 403을 던진다", async () => {
    mockedRepository.getById.mockResolvedValue({ moverId: 2, quotationRequestId: 27 } as never);
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({ userId: 2 } as never);

    await expect(estimateService.getById(1, 1, "CUSTOMER")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("customer 본인 요청이면 반환한다", async () => {
    const estimate = { moverId: 2, quotationRequestId: 27 };
    mockedRepository.getById.mockResolvedValue(estimate as never);
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({ userId: 1 } as never);

    const result = await estimateService.getById(1, 1, "CUSTOMER");

    expect(result).toBe(estimate);
  });
});

describe("reject", () => {
  test("요청이 활성 상태가 아니면 400을 던진다", async () => {
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({
      quotationStatus: "ASSIGNED",
    } as never);

    await expect(estimateService.reject(27, 10, "너무 멀어서 어렵습니다")).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.NO_ACTIVE_REQUEST,
    });
  });

  test("지정된 견적 요청이 아니면 403을 던진다", async () => {
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({
      quotationStatus: "PENDING",
    } as never);
    mockedPrisma.targetedRequest.findUnique.mockResolvedValue(null as never);

    await expect(estimateService.reject(27, 10, "너무 멀어서 어렵습니다")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockedRepository.reject).not.toHaveBeenCalled();
  });

  test("지정된 견적 요청이면 repository에 위임한다", async () => {
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({
      quotationStatus: "PENDING",
    } as never);
    mockedPrisma.targetedRequest.findUnique.mockResolvedValue({ moverId: 10 } as never);
    mockedRepository.reject.mockResolvedValue({} as never);

    await estimateService.reject(27, 10, "너무 멀어서 어렵습니다");

    expect(mockedRepository.reject).toHaveBeenCalledWith({
      quotationRequestId: 27,
      moverId: 10,
      comment: "너무 멀어서 어렵습니다",
    });
  });
});

describe("save", () => {
  test("요청이 활성 상태가 아니면 400을 던진다", async () => {
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue(null as never);

    await expect(
      estimateService.save(27, 10, 50000, "친절히 도와드리겠습니다")
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test("지정견적이면 isTargeted=true로 넘긴다", async () => {
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({
      quotationStatus: "PENDING",
    } as never);
    mockedPrisma.targetedRequest.findUnique.mockResolvedValue({ moverId: 10 } as never);
    mockedRepository.save.mockResolvedValue({} as never);

    await estimateService.save(27, 10, 50000, "친절히 도와드리겠습니다");

    expect(mockedRepository.save).toHaveBeenCalledWith(
      { quotationRequestId: 27, moverId: 10, price: 50000, comment: "친절히 도와드리겠습니다" },
      true
    );
  });

  test("일반견적이면 isTargeted=false로 넘긴다", async () => {
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({
      quotationStatus: "PENDING",
    } as never);
    mockedPrisma.targetedRequest.findUnique.mockResolvedValue(null as never);
    mockedRepository.save.mockResolvedValue({} as never);

    await estimateService.save(27, 10, 50000, "친절히 도와드리겠습니다");

    expect(mockedRepository.save).toHaveBeenCalledWith(
      { quotationRequestId: 27, moverId: 10, price: 50000, comment: "친절히 도와드리겠습니다" },
      false
    );
  });
});

describe("confirm", () => {
  test("견적이 없으면 404를 던진다", async () => {
    mockedRepository.getById.mockResolvedValue(null);

    await expect(estimateService.confirm(1, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  test("이미 처리된 견적이면 400을 던진다", async () => {
    mockedRepository.getById.mockResolvedValue({ estimateStatus: "CONFIRMED" } as never);

    await expect(estimateService.confirm(1, 1)).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.ESTIMATE_ALREADY_PROCESSED,
    });
  });

  test("본인 요청이 아니면 403을 던진다", async () => {
    mockedRepository.getById.mockResolvedValue({
      estimateStatus: "PENDING",
      quotationRequestId: 27,
      moverId: 10,
    } as never);
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({
      userId: 2,
      quotationStatus: "PENDING",
    } as never);

    await expect(estimateService.confirm(1, 1)).rejects.toMatchObject({ statusCode: 403 });
  });

  test("본인 요청이고 활성 상태면 repository에 위임한다", async () => {
    mockedRepository.getById.mockResolvedValue({
      estimateStatus: "PENDING",
      quotationRequestId: 27,
      moverId: 10,
    } as never);
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({
      userId: 1,
      quotationStatus: "PENDING",
    } as never);
    mockedRepository.confirm.mockResolvedValue({} as never);

    await estimateService.confirm(1, 1);

    expect(mockedRepository.confirm).toHaveBeenCalledWith(1, 10);
  });
});
