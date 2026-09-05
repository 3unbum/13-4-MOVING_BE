import { ERROR_CODES } from "@/common/errors/errorCodes";
import { favoriteService } from "@/modules/favorite/favorite.service";
import { moverRepository } from "./mover.repository";
import { moverService } from "./mover.service";

jest.mock("./mover.repository", () => ({
  moverRepository: {
    findList: jest.fn(),
    findDetailByUserId: jest.fn(),
    existsFavorite: jest.fn(),
    isTargetedInActiveRequest: jest.fn(),
    existsMover: jest.fn(),
    findConfirmedReviewsByMoverId: jest.fn(),
  },
}));

jest.mock("@/modules/favorite/favorite.service", () => ({
  favoriteService: {
    create: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(moverRepository);
const mockedFavoriteService = jest.mocked(favoriteService);

/** 목록용 프로필 픽스처 */
function makeListProfile(overrides: Partial<{ id: number; userId: number }> = {}) {
  const id = overrides.id ?? 1;
  const userId = overrides.userId ?? 10;

  return {
    id,
    userId,
    nickName: "믿음직한 이사왕",
    image: null,
    career: 7,
    avgRating: 4.5,
    reviewCount: 12,
    confirmedCount: 8,
    favoriteCount: 3,
    user: {
      moverServices: [{ service: "HOME" as const }, { service: "SMALL" as const }],
      moverRegions: [{ region: "SEOUL" as const }, { region: "GYEONGGI" as const }],
    },
  };
}

/** 상세용 유저 픽스처 */
function makeDetailUser(overrides: { role?: "MOVER" | "CUSTOMER"; hasProfile?: boolean } = {}) {
  const hasProfile = overrides.hasProfile ?? true;
  const role = overrides.role ?? "MOVER";

  return {
    id: 10,
    role,
    moverProfile: hasProfile
      ? {
          nickName: "믿음직한 이사왕",
          image: null,
          career: 7,
          bio: "고객 만족을 최우선으로 생각합니다",
          description: "7년 경력 기사입니다.",
          avgRating: 4.5,
          reviewCount: 12,
          confirmedCount: 8,
          favoriteCount: 3,
        }
      : null,
    moverServices: [{ service: "HOME" as const }],
    moverRegions: [{ region: "SEOUL" as const }],
  };
}

/** 요청용 cursor 픽스처 생성 (응답 nextCursor 검증에는 쓰지 않음) */
function encodeTestCursor(profile: ReturnType<typeof makeListProfile>) {
  return Buffer.from(
    JSON.stringify({
      profileId: profile.id,
      userId: profile.userId,
      reviewCount: profile.reviewCount,
      avgRating: Number(profile.avgRating),
      career: profile.career,
      confirmedCount: profile.confirmedCount,
    })
  ).toString("base64url");
}

beforeEach(() => {
  // Teardown — 이전 테스트 mock 호출 이력 초기화
  jest.clearAllMocks();
});

describe("moverService.list", () => {
  test("프로필을 카드 DTO로 매핑한다", async () => {
    // Setup
    mockedRepository.findList.mockResolvedValue([makeListProfile()] as never);

    // Exercise
    const result = await moverService.list({ sort: "review", limit: 10 });

    // Assertion
    expect(mockedRepository.findList).toHaveBeenCalledWith({
      keyword: undefined,
      region: undefined,
      service: undefined,
      sort: "review",
      cursor: undefined,
      limit: 10,
    });
    expect(result).toEqual({
      data: [
        {
          id: 10,
          nickName: "믿음직한 이사왕",
          image: null,
          career: 7,
          avgRating: 4.5,
          reviewCount: 12,
          confirmedCount: 8,
          favoriteCount: 3,
          services: ["가정이사", "소형이사"],
          regions: ["서울", "경기"],
        },
      ],
      nextCursor: null,
      hasNext: false,
    });
  });

  test("한글 region·service를 enum으로 변환해 repository에 넘긴다", async () => {
    // Setup
    mockedRepository.findList.mockResolvedValue([] as never);

    // Exercise
    await moverService.list({
      keyword: "이사",
      region: "서울",
      service: "소형이사",
      sort: "rating",
      limit: 5,
    });

    // Assertion
    expect(mockedRepository.findList).toHaveBeenCalledWith({
      keyword: "이사",
      region: "SEOUL",
      service: "SMALL",
      sort: "rating",
      cursor: undefined,
      limit: 5,
    });
  });

  test("파싱 불가한 region·service는 repository에 undefined로 넘긴다", async () => {
    // Setup
    mockedRepository.findList.mockResolvedValue([] as never);

    // Exercise
    await moverService.list({
      region: "없는지역",
      service: "없는서비스",
      sort: "review",
      limit: 10,
    });

    // Assertion
    expect(mockedRepository.findList).toHaveBeenCalledWith(
      expect.objectContaining({ region: undefined, service: undefined })
    );
  });

  test("limit보다 많으면 hasNext true와 nextCursor를 반환한다", async () => {
    // Setup
    const profiles = [
      makeListProfile({ id: 1, userId: 10 }),
      makeListProfile({ id: 2, userId: 11 }),
      makeListProfile({ id: 3, userId: 12 }),
    ];
    mockedRepository.findList.mockResolvedValue(profiles as never);

    // Exercise
    const result = await moverService.list({ sort: "review", limit: 2 });

    // Assertion — base64 문자열 일치가 아니라 디코딩 값으로 검증 (key 순서에 무관)
    expect(result.hasNext).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();
    const decoded = JSON.parse(Buffer.from(result.nextCursor!, "base64url").toString("utf8"));
    expect(decoded).toEqual({
      profileId: 2,
      userId: 11,
      reviewCount: 12,
      avgRating: 4.5,
      career: 7,
      confirmedCount: 8,
    });
  });

  test("정확히 limit개만 반환되면 hasNext는 false다", async () => {
    // Setup — take(limit+1) 결과 길이가 limit이면 다음 페이지 없음
    const profiles = [makeListProfile({ id: 1, userId: 10 }), makeListProfile({ id: 2, userId: 11 })];
    mockedRepository.findList.mockResolvedValue(profiles as never);

    // Exercise
    const result = await moverService.list({ sort: "review", limit: 2 });

    // Assertion
    expect(result.hasNext).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.data).toHaveLength(2);
  });

  test("유효한 cursor를 디코딩해 repository에 넘긴다", async () => {
    // Setup — 요청용 cursor 생성(입력 픽스처). 응답 nextCursor 검증과는 별개
    const cursorProfile = makeListProfile({ id: 5, userId: 20 });
    const cursor = encodeTestCursor(cursorProfile);
    mockedRepository.findList.mockResolvedValue([] as never);

    // Exercise
    await moverService.list({ sort: "review", cursor, limit: 10 });

    // Assertion
    expect(mockedRepository.findList).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: {
          profileId: 5,
          userId: 20,
          reviewCount: 12,
          avgRating: 4.5,
          career: 7,
          confirmedCount: 8,
        },
      })
    );
  });

  test("잘못된 cursor면 400을 던진다", async () => {
    // Setup — JSON 파싱 실패 경로

    // Exercise + Assertion
    await expect(
      moverService.list({ sort: "review", cursor: "not-a-valid-cursor", limit: 10 })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
    expect(mockedRepository.findList).not.toHaveBeenCalled();
  });

  test("cursor payload가 스키마에 맞지 않으면 400을 던진다", async () => {
    // Setup — base64/JSON은 성공하지만 zod 검증 실패 (profileId가 문자열)
    const invalidCursor = Buffer.from(
      JSON.stringify({
        profileId: "not-a-number",
        userId: 20,
        reviewCount: 12,
        avgRating: 4.5,
        career: 7,
        confirmedCount: 8,
      })
    ).toString("base64url");

    // Exercise + Assertion
    await expect(
      moverService.list({ sort: "review", cursor: invalidCursor, limit: 10 })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
    expect(mockedRepository.findList).not.toHaveBeenCalled();
  });

  test("limit·sort 생략 시 기본값을 사용한다", async () => {
    // Setup
    mockedRepository.findList.mockResolvedValue([] as never);

    // Exercise — schema default를 거친 뒤의 형태를 흉내 (limit/sort 미지정)
    await moverService.list({} as never);

    // Assertion
    expect(mockedRepository.findList).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "review", limit: 10 })
    );
  });
});

describe("moverService.getById", () => {
  test("상세 DTO를 반환한다", async () => {
    // Setup
    mockedRepository.findDetailByUserId.mockResolvedValue(makeDetailUser() as never);

    // Exercise
    const result = await moverService.getById(10);

    // Assertion
    expect(mockedRepository.findDetailByUserId).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      id: 10,
      nickName: "믿음직한 이사왕",
      image: null,
      career: 7,
      bio: "고객 만족을 최우선으로 생각합니다",
      description: "7년 경력 기사입니다.",
      avgRating: 4.5,
      reviewCount: 12,
      confirmedCount: 8,
      favoriteCount: 3,
      services: ["가정이사"],
      regions: ["서울"],
    });
    expect(result).not.toHaveProperty("isFavorited");
    expect(result).not.toHaveProperty("isTargeted");
  });

  test("CUSTOMER viewer면 isFavorited·isTargeted를 포함한다", async () => {
    // Setup
    mockedRepository.findDetailByUserId.mockResolvedValue(makeDetailUser() as never);
    mockedRepository.existsFavorite.mockResolvedValue(true);
    mockedRepository.isTargetedInActiveRequest.mockResolvedValue(false);

    // Exercise
    const result = await moverService.getById(10, { id: 1, role: "CUSTOMER" });

    // Assertion
    expect(mockedRepository.existsFavorite).toHaveBeenCalledWith(1, 10);
    expect(mockedRepository.isTargetedInActiveRequest).toHaveBeenCalledWith(1, 10);
    expect(result.isFavorited).toBe(true);
    expect(result.isTargeted).toBe(false);
  });

  test("MOVER viewer면 찜·지정 여부를 조회하지 않는다", async () => {
    // Setup
    mockedRepository.findDetailByUserId.mockResolvedValue(makeDetailUser() as never);

    // Exercise
    const result = await moverService.getById(10, { id: 10, role: "MOVER" });

    // Assertion
    expect(mockedRepository.existsFavorite).not.toHaveBeenCalled();
    expect(mockedRepository.isTargetedInActiveRequest).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("isFavorited");
  });

  test("기사님이 없으면 404를 던진다", async () => {
    // Setup
    mockedRepository.findDetailByUserId.mockResolvedValue(null);

    // Exercise + Assertion
    await expect(moverService.getById(999)).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  test("역할이 MOVER가 아니면 404를 던진다", async () => {
    // Setup
    mockedRepository.findDetailByUserId.mockResolvedValue(
      makeDetailUser({ role: "CUSTOMER" }) as never
    );

    // Exercise + Assertion
    await expect(moverService.getById(1)).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  test("프로필이 없으면 404를 던진다", async () => {
    // Setup
    mockedRepository.findDetailByUserId.mockResolvedValue(
      makeDetailUser({ hasProfile: false }) as never
    );

    // Exercise + Assertion
    await expect(moverService.getById(10)).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
    });
  });
});

describe("moverService.listReviews", () => {
  test("CONFIRMED 리뷰를 페이지 응답으로 매핑한다", async () => {
    // Setup
    const createdAt = new Date("2026-01-15T00:00:00.000Z");
    mockedRepository.existsMover.mockResolvedValue(true);
    mockedRepository.findConfirmedReviewsByMoverId.mockResolvedValue([
      [
        {
          id: 1,
          rating: 5,
          comment: "친절했어요",
          createdAt,
          customer: { name: "김소비" },
        },
      ],
      11,
    ] as never);

    // Exercise
    const result = await moverService.listReviews(10, { page: 2, limit: 5 });

    // Assertion
    expect(mockedRepository.findConfirmedReviewsByMoverId).toHaveBeenCalledWith(10, 2, 5);
    expect(result).toEqual({
      data: [
        {
          id: 1,
          rating: 5,
          comment: "친절했어요",
          createdAt: "2026-01-15T00:00:00.000Z",
          customerName: "김소비",
        },
      ],
      page: 2,
      totalPages: 3,
      totalCount: 11,
    });
  });

  test("rating·comment가 null이면 기본값으로 매핑한다", async () => {
    // Setup
    mockedRepository.existsMover.mockResolvedValue(true);
    mockedRepository.findConfirmedReviewsByMoverId.mockResolvedValue([
      [
        {
          id: 2,
          rating: null,
          comment: null,
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          customer: { name: "박신규" },
        },
      ],
      1,
    ] as never);

    // Exercise
    const result = await moverService.listReviews(10, { page: 1, limit: 5 });

    // Assertion
    expect(result.data[0]).toMatchObject({ rating: 0, comment: "" });
  });

  test("리뷰가 없으면 totalPages는 0이다", async () => {
    // Setup
    mockedRepository.existsMover.mockResolvedValue(true);
    mockedRepository.findConfirmedReviewsByMoverId.mockResolvedValue([[], 0] as never);

    // Exercise
    const result = await moverService.listReviews(10, { page: 1, limit: 5 });

    // Assertion
    expect(result).toEqual({ data: [], page: 1, totalPages: 0, totalCount: 0 });
  });

  test("totalCount가 limit으로 나누어떨어지면 totalPages는 몫이다", async () => {
    // Setup — Math.ceil(10/5)=2 (나머지 없는 경계)
    mockedRepository.existsMover.mockResolvedValue(true);
    mockedRepository.findConfirmedReviewsByMoverId.mockResolvedValue([[], 10] as never);

    // Exercise
    const result = await moverService.listReviews(10, { page: 1, limit: 5 });

    // Assertion
    expect(result.totalPages).toBe(2);
    expect(result.totalCount).toBe(10);
  });

  test("기사님이 없으면 404를 던진다", async () => {
    // Setup
    mockedRepository.existsMover.mockResolvedValue(false);

    // Exercise + Assertion
    await expect(moverService.listReviews(999, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
    });
    expect(mockedRepository.findConfirmedReviewsByMoverId).not.toHaveBeenCalled();
  });

  test("page·limit 생략 시 기본값을 사용한다", async () => {
    // Setup
    mockedRepository.existsMover.mockResolvedValue(true);
    mockedRepository.findConfirmedReviewsByMoverId.mockResolvedValue([[], 0] as never);

    // Exercise
    await moverService.listReviews(10, {} as never);

    // Assertion
    expect(mockedRepository.findConfirmedReviewsByMoverId).toHaveBeenCalledWith(10, 1, 5);
  });
});

describe("moverService.createFavorite", () => {
  test("favoriteService.create에 위임한다", async () => {
    // Setup
    const card = { id: 10, nickName: "믿음직한 이사왕" };
    mockedFavoriteService.create.mockResolvedValue(card as never);

    // Exercise
    const result = await moverService.createFavorite(1, 10);

    // Assertion
    expect(mockedFavoriteService.create).toHaveBeenCalledWith(1, 10);
    expect(result).toEqual(card);
  });

  test("favoriteService 에러를 그대로 전달한다", async () => {
    // Setup
    mockedFavoriteService.create.mockRejectedValue({
      statusCode: 409,
      code: ERROR_CODES.ALREADY_FAVORITED,
    });

    // Exercise + Assertion
    await expect(moverService.createFavorite(1, 10)).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.ALREADY_FAVORITED,
    });
  });
});

describe("moverService.deleteFavorite", () => {
  test("favoriteService.delete에 위임한다", async () => {
    // Setup
    const deleted = { deletedCount: 1, deletedMoverIds: [10] };
    mockedFavoriteService.delete.mockResolvedValue(deleted);

    // Exercise
    const result = await moverService.deleteFavorite(1, 10);

    // Assertion
    expect(mockedFavoriteService.delete).toHaveBeenCalledWith(1, 10);
    expect(result).toEqual(deleted);
  });

  test("찜이 없으면 404를 그대로 전달한다", async () => {
    // Setup
    mockedFavoriteService.delete.mockRejectedValue({
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
    });

    // Exercise + Assertion
    await expect(moverService.deleteFavorite(1, 10)).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
    });
  });
});
