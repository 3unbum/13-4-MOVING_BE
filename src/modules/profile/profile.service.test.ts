import { Prisma } from "../../../generated/prisma/client";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { profileService } from "./profile.service";
import { profileRepository } from "./profile.repository";
import type { CustomerProfileCreateDto, MoverProfileCreateDto } from "./profile.schema";

/**
 * generated/prisma/client의 실제 모듈은 ts-jest에서 내부 상대 import resolve가 깨지므로,
 * profile.service.ts가 P2002 판별에 필요로 하는 PrismaClientKnownRequestError만 최소로 흉내낸다.
 * (auth.service.test.ts와 동일한 패턴)
 */
jest.mock("../../../generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, opts: { code: string; clientVersion: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));

jest.mock("./profile.repository", () => ({
  profileRepository: {
    exists: jest.fn(),
    createCustomerProfile: jest.fn(),
    createMoverProfile: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(profileRepository);

/** P2002는 인스턴스 자체를 만들어 instanceof 검사를 실제로 통과시킨다 */
function makeP2002Error() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

function makeCustomerDto(): CustomerProfileCreateDto {
  return { region: "SEOUL", services: ["SMALL", "HOME"] };
}

function makeMoverDto(): MoverProfileCreateDto {
  return {
    nickName: "믿음직한 이사왕",
    career: 5,
    bio: "고객 만족 최우선",
    description: "친절하고 꼼꼼하게 도와드립니다",
    services: ["SMALL"],
    regions: ["SEOUL", "GYEONGGI"],
  };
}

describe("profileService.registerCustomerProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("프로필을 생성하고 결과를 반환한다", async () => {
    mockedRepository.exists.mockResolvedValue(false);
    mockedRepository.createCustomerProfile.mockResolvedValue({
      id: 1,
      userId: 10,
      image: null,
      region: "SEOUL",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const dto = makeCustomerDto();
    const result = await profileService.registerCustomerProfile(10, dto);

    expect(mockedRepository.exists).toHaveBeenCalledWith(10, "CUSTOMER");
    expect(mockedRepository.createCustomerProfile).toHaveBeenCalledWith(10, dto);
    expect(result).toEqual({
      id: 1,
      userId: 10,
      image: null,
      region: "SEOUL",
      services: ["SMALL", "HOME"],
    });
  });

  it("이미 프로필이 있으면 409를 던진다", async () => {
    mockedRepository.exists.mockResolvedValue(true);

    await expect(profileService.registerCustomerProfile(10, makeCustomerDto())).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.PROFILE_ALREADY_EXISTS,
    });
    expect(mockedRepository.createCustomerProfile).not.toHaveBeenCalled();
  });

  it("거의 동시에 같은 유저가 등록 요청을 겹치면 409를 던진다", async () => {
    mockedRepository.exists.mockResolvedValue(false);
    mockedRepository.createCustomerProfile.mockRejectedValue(makeP2002Error());

    await expect(profileService.registerCustomerProfile(10, makeCustomerDto())).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.PROFILE_ALREADY_EXISTS,
    });
  });

  it("유니크 제약 위반이 아닌 다른 이유로 저장이 실패하면 에러를 그대로 전파한다", async () => {
    mockedRepository.exists.mockResolvedValue(false);
    const unknownError = new Error("db down");
    mockedRepository.createCustomerProfile.mockRejectedValue(unknownError);

    await expect(profileService.registerCustomerProfile(10, makeCustomerDto())).rejects.toBe(
      unknownError
    );
  });
});

describe("profileService.registerMoverProfile", () => {
  beforeEach(() => jest.clearAllMocks());

  it("프로필을 생성하고 결과를 반환한다", async () => {
    mockedRepository.exists.mockResolvedValue(false);
    mockedRepository.createMoverProfile.mockResolvedValue({
      id: 1,
      userId: 20,
      image: null,
      nickName: "믿음직한 이사왕",
      career: 5,
      bio: "고객 만족 최우선",
      description: "친절하고 꼼꼼하게 도와드립니다",
      avgRating: 0,
      reviewCount: 0,
      confirmedCount: 0,
      favoriteCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const dto = makeMoverDto();
    const result = await profileService.registerMoverProfile(20, dto);

    expect(mockedRepository.exists).toHaveBeenCalledWith(20, "MOVER");
    expect(mockedRepository.createMoverProfile).toHaveBeenCalledWith(20, dto);
    expect(result).toEqual({
      id: 1,
      userId: 20,
      image: null,
      nickName: "믿음직한 이사왕",
      career: 5,
      bio: "고객 만족 최우선",
      description: "친절하고 꼼꼼하게 도와드립니다",
      services: ["SMALL"],
      regions: ["SEOUL", "GYEONGGI"],
    });
  });

  it("이미 프로필이 있으면 409를 던진다", async () => {
    mockedRepository.exists.mockResolvedValue(true);

    await expect(profileService.registerMoverProfile(20, makeMoverDto())).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.PROFILE_ALREADY_EXISTS,
    });
    expect(mockedRepository.createMoverProfile).not.toHaveBeenCalled();
  });

  it("거의 동시에 같은 유저가 등록 요청을 겹치면 409를 던진다", async () => {
    mockedRepository.exists.mockResolvedValue(false);
    mockedRepository.createMoverProfile.mockRejectedValue(makeP2002Error());

    await expect(profileService.registerMoverProfile(20, makeMoverDto())).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.PROFILE_ALREADY_EXISTS,
    });
  });

  it("유니크 제약 위반이 아닌 다른 이유로 저장이 실패하면 에러를 그대로 전파한다", async () => {
    mockedRepository.exists.mockResolvedValue(false);
    const unknownError = new Error("db down");
    mockedRepository.createMoverProfile.mockRejectedValue(unknownError);

    await expect(profileService.registerMoverProfile(20, makeMoverDto())).rejects.toBe(unknownError);
  });
});
