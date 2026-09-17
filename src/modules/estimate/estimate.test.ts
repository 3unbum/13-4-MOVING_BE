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
    quotationRequest: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    targetedRequest: { findUnique: jest.fn(), findMany: jest.fn() },
    moverRegion: { findMany: jest.fn() },
  },
}));

const mockedRepository = jest.mocked(estimateRepository);
const mockedPrisma = prisma as unknown as {
  quotationRequest: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  targetedRequest: { findUnique: jest.Mock; findMany: jest.Mock };
  moverRegion: { findMany: jest.Mock };
};

beforeEach(() => jest.clearAllMocks());

/**
 * repository가 estimateInclude로 함께 실어오는 mover·quotationRequest까지 갖춘 견적 목.
 * 서비스가 DTO(toEstimateResponse)로 평탄화하므로 이 두 관계가 없으면 응답을 만들 수 없습니다.
 */
function mockEstimate(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    quotationRequestId: 27,
    moverId: 1,
    price: 180000,
    comment: "견적 코멘트",
    estimateStatus: "PENDING",
    mover: {
      id: 1,
      name: "김코드",
      moverProfile: {
        image: null,
        nickName: "김코드",
        career: 7,
        bio: "한 줄 소개",
        avgRating: 5,
        reviewCount: 178,
        confirmedCount: 334,
        favoriteCount: 136,
      },
    },
    quotationRequest: {
      id: 27,
      category: "SMALL",
      movingDate: new Date("2026-07-01"),
      createdAt: new Date("2026-06-24"),
      targetedRequests: [],
    },
    ...overrides,
  };
}

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
    mockedRepository.getById.mockResolvedValue(mockEstimate({ moverId: 1 }) as never);

    const result = await estimateService.getById(1, 1, "MOVER");

    expect(result).toMatchObject({ moverId: 1, price: 180000 });
  });

  test("응답에 기사님 정보가 평탄화되어 들어간다", async () => {
    mockedRepository.getById.mockResolvedValue(mockEstimate({ moverId: 1 }) as never);

    const result = await estimateService.getById(1, 1, "MOVER");

    expect(result.mover).toMatchObject({
      nickName: "김코드",
      career: 7,
      avgRating: 5,
      reviewCount: 178,
      confirmedCount: 334,
      favoriteCount: 136,
    });
  });

  test("지정 목록에 있는 기사님이면 isTargeted가 true다", async () => {
    mockedRepository.getById.mockResolvedValue(
      mockEstimate({
        moverId: 1,
        quotationRequest: {
          id: 27,
          category: "SMALL",
          movingDate: new Date("2026-07-01"),
          createdAt: new Date("2026-06-24"),
          targetedRequests: [{ moverId: 1 }],
        },
      }) as never
    );

    const result = await estimateService.getById(1, 1, "MOVER");

    expect(result.isTargeted).toBe(true);
  });

  test("지정 목록에 없는 기사님이면 isTargeted가 false다", async () => {
    mockedRepository.getById.mockResolvedValue(
      mockEstimate({
        moverId: 1,
        quotationRequest: {
          id: 27,
          category: "SMALL",
          movingDate: new Date("2026-07-01"),
          createdAt: new Date("2026-06-24"),
          targetedRequests: [{ moverId: 99 }],
        },
      }) as never
    );

    const result = await estimateService.getById(1, 1, "MOVER");

    expect(result.isTargeted).toBe(false);
  });

  test("customer 본인 요청이 아니면 403을 던진다", async () => {
    mockedRepository.getById.mockResolvedValue({ moverId: 2, quotationRequestId: 27 } as never);
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({ userId: 2 } as never);

    await expect(estimateService.getById(1, 1, "CUSTOMER")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  test("customer 본인 요청이면 반환한다", async () => {
    mockedRepository.getById.mockResolvedValue(
      mockEstimate({ moverId: 2, quotationRequestId: 27 }) as never
    );
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({ userId: 1 } as never);

    const result = await estimateService.getById(1, 1, "CUSTOMER");

    expect(result).toMatchObject({ moverId: 2, quotationRequestId: 27 });
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
    mockedPrisma.quotationRequest.findUnique.mockResolvedValue({
      quotationStatus: "ASSIGNED",
    } as never);

    await expect(
      estimateService.save(27, 10, 50000, "친절히 도와드리겠습니다")
    ).rejects.toMatchObject({ statusCode: 400, code: ERROR_CODES.NO_ACTIVE_REQUEST });
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

/**
 * 받은 요청 목(mock) — moverRequestInclude가 user를 함께 실어옵니다.
 * 카드에 "OOO 고객님"이 들어가는데 응답에 userId뿐이라 이름을 채울 수 없었습니다(#88).
 */
function mockMoverRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    userId: 180,
    category: "SMALL",
    movingDate: new Date("2026-09-30"),
    fromRegion: "SEOUL",
    quotationStatus: "PENDING",
    user: { name: "최지우" },
    ...overrides,
  };
}

/** zod transform 후 타입 — isServiceRegion·isTargeted는 항상 boolean으로 들어옵니다 */
function baseQuery(overrides: Record<string, unknown> = {}) {
  return { isServiceRegion: false, isTargeted: false, ...overrides } as Parameters<
    typeof estimateService.getMoverRequests
  >[1];
}

describe("getMoverRequests", () => {
  it("고객 이름을 userName으로 평탄화한다", async () => {
    mockedPrisma.quotationRequest.findMany.mockResolvedValue([mockMoverRequest()]);

    const result = await estimateService.getMoverRequests(1, baseQuery());

    expect(result[0]).toMatchObject({ id: 41, userName: "최지우" });
  });

  it("user 객체를 응답에 노출하지 않는다", async () => {
    mockedPrisma.quotationRequest.findMany.mockResolvedValue([mockMoverRequest()]);

    const result = await estimateService.getMoverRequests(1, baseQuery());

    // user를 통째로 내보내면 필드가 늘어날 때 password 등이 새어나갑니다
    expect(result[0]).not.toHaveProperty("user");
  });

  it("search를 넘기면 고객 이름으로 거른다", async () => {
    mockedPrisma.quotationRequest.findMany.mockResolvedValue([mockMoverRequest()]);

    await estimateService.getMoverRequests(1, baseQuery({ search: "홍" }));

    const where = mockedPrisma.quotationRequest.findMany.mock.calls[0][0].where;
    expect(where.user).toEqual({ name: { contains: "홍", mode: "insensitive" } });
  });

  it("search가 없으면 이름 조건을 걸지 않는다", async () => {
    mockedPrisma.quotationRequest.findMany.mockResolvedValue([mockMoverRequest()]);

    await estimateService.getMoverRequests(1, baseQuery());

    expect(mockedPrisma.quotationRequest.findMany.mock.calls[0][0].where.user).toBeUndefined();
  });

  it("지정받은 시점순(targetedAt)에서도 이름이 들어간다", async () => {
    // 이 정렬만 targetedRequest를 거쳐 조회하므로 경로가 갈립니다
    mockedPrisma.targetedRequest.findMany.mockResolvedValue([
      { quotationRequest: mockMoverRequest({ id: 45, user: { name: "윤지호" } }) },
    ]);

    const result = await estimateService.getMoverRequests(1, baseQuery({ sort: "targetedAt" }));

    expect(result[0]).toMatchObject({ id: 45, userName: "윤지호" });
    expect(mockedPrisma.quotationRequest.findMany).not.toHaveBeenCalled();
  });
});
