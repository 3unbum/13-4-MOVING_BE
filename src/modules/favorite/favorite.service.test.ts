import { ERROR_CODES } from "../../common/errors/errorCodes";
import { favoriteService } from "./favorite.service";
import { favoriteRepository } from "./favorite.repository";

jest.mock("./favorite.repository", () => ({
  favoriteRepository: {
    findAllByUserId: jest.fn(),
    findMoverForFavorite: jest.fn(),
    findOne: jest.fn(),
    createOwned: jest.fn(),
    deleteOwned: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(favoriteRepository);

function makeRow(moverId = 10) {
  return {
    moverId,
    mover: {
      id: moverId,
      moverProfile: {
        nickName: "믿음직한 이사왕",
        bio: "고객 만족을 최우선으로 생각합니다",
        image: null,
        avgRating: { toNumber: () => 4.5 },
        reviewCount: 12,
        confirmedCount: 8,
        favoriteCount: 3,
      },
      moverServices: [{ service: "HOME" }, { service: "SMALL" }],
      moverRegions: [{ region: "SEOUL" }, { region: "GYEONGGI" }],
    },
  };
}

describe("favoriteService.list", () => {
  beforeEach(() => jest.clearAllMocks());

  it("카드로 매핑하고 total은 개수다", async () => {
    mockedRepository.findAllByUserId.mockResolvedValue([makeRow()] as never);

    const result = await favoriteService.list(1);

    expect(mockedRepository.findAllByUserId).toHaveBeenCalledWith(1, undefined);
    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual({
      id: 10,
      nickName: "믿음직한 이사왕",
      bio: "고객 만족을 최우선으로 생각합니다",
      image: null,
      avgRating: 4.5,
      reviewCount: 12,
      confirmedCount: 8,
      favoriteCount: 3,
      services: ["HOME", "SMALL"],
      regions: ["SEOUL", "GYEONGGI"],
    });
  });

  it("limit=3이면 take로 넘긴다", async () => {
    mockedRepository.findAllByUserId.mockResolvedValue([] as never);

    await favoriteService.list(1, 3);

    expect(mockedRepository.findAllByUserId).toHaveBeenCalledWith(1, 3);
  });
});

describe("favoriteService.bulkDelete", () => {
  beforeEach(() => jest.clearAllMocks());

  it("중복 moverId를 제거하고 repository에 위임한다", async () => {
    mockedRepository.deleteOwned.mockResolvedValue({
      deletedCount: 2,
      deletedMoverIds: [1, 2],
    });

    const result = await favoriteService.bulkDelete(99, [1, 1, 2]);

    expect(mockedRepository.deleteOwned).toHaveBeenCalledWith(99, [1, 2]);
    expect(result).toEqual({ deletedCount: 2, deletedMoverIds: [1, 2] });
  });
});

describe("favoriteService.create", () => {
  beforeEach(() => jest.clearAllMocks());

  it("기사님을 찜하고 카드를 반환한다", async () => {
    mockedRepository.findMoverForFavorite.mockResolvedValue({ id: 10 });
    mockedRepository.findOne.mockResolvedValue(null);
    mockedRepository.createOwned.mockResolvedValue(makeRow(10) as never);

    const result = await favoriteService.create(1, 10);

    expect(mockedRepository.createOwned).toHaveBeenCalledWith(1, 10);
    expect(result.id).toBe(10);
    expect(result.nickName).toBe("믿음직한 이사왕");
  });

  it("자기 자신이면 400을 던진다", async () => {
    await expect(favoriteService.create(10, 10)).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
    expect(mockedRepository.createOwned).not.toHaveBeenCalled();
  });

  it("기사님이 없으면 404를 던진다", async () => {
    mockedRepository.findMoverForFavorite.mockResolvedValue(null);

    await expect(favoriteService.create(1, 10)).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it("이미 찜이면 409를 던진다", async () => {
    mockedRepository.findMoverForFavorite.mockResolvedValue({ id: 10 });
    mockedRepository.findOne.mockResolvedValue({ id: 1, userId: 1, moverId: 10 } as never);

    await expect(favoriteService.create(1, 10)).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.ALREADY_FAVORITED,
    });
    expect(mockedRepository.createOwned).not.toHaveBeenCalled();
  });
});
