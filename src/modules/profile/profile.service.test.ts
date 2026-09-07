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
    findCustomerAccount: jest.fn(),
    findMoverAccount: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(profileRepository);

beforeEach(() => jest.clearAllMocks());

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

describe("profileService.getCustomerAccount", () => {
  it("프로필이 있으면 계정 정보 + 프로필 정보를 합쳐서 반환한다", async () => {
    mockedRepository.findCustomerAccount.mockResolvedValue({
      id: 1,
      name: "홍길동",
      email: "user@example.com",
      phoneNumber: "010-1234-5678",
      customerProfile: { image: "https://img", region: "SEOUL" },
      customerServices: [{ service: "SMALL" }, { service: "HOME" }],
    } as never);

    const result = await profileService.getCustomerAccount(1);

    expect(mockedRepository.findCustomerAccount).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      userId: 1,
      role: "CUSTOMER",
      name: "홍길동",
      email: "user@example.com",
      phoneNumber: "010-1234-5678",
      hasProfile: true,
      image: "https://img",
      region: "SEOUL",
      services: ["SMALL", "HOME"],
    });
  });

  it("프로필이 없으면 hasProfile: false와 빈 값을 반환한다", async () => {
    mockedRepository.findCustomerAccount.mockResolvedValue({
      id: 2,
      name: "김철수",
      email: "kim@example.com",
      phoneNumber: "010-0000-0000",
      customerProfile: null,
      customerServices: [],
    } as never);

    const result = await profileService.getCustomerAccount(2);

    expect(result).toEqual({
      userId: 2,
      role: "CUSTOMER",
      name: "김철수",
      email: "kim@example.com",
      phoneNumber: "010-0000-0000",
      hasProfile: false,
      image: null,
      region: null,
      services: [],
    });
  });

  it("유저가 없으면 404를 던진다", async () => {
    mockedRepository.findCustomerAccount.mockResolvedValue(null);

    await expect(profileService.getCustomerAccount(999)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("profileService.getMoverAccount", () => {
  it("프로필이 있으면 계정 정보 + 프로필 정보를 합쳐서 반환한다", async () => {
    mockedRepository.findMoverAccount.mockResolvedValue({
      id: 5,
      name: "김코드",
      email: "driver@example.com",
      phoneNumber: "010-9999-8888",
      moverProfile: {
        image: "https://img",
        nickName: "김코드",
        career: 8,
        bio: "한 줄 소개",
        description: "상세 설명",
        avgRating: { toString: () => "4.5" } as unknown as number,
      },
      moverServices: [{ service: "SMALL" }],
      moverRegions: [{ region: "SEOUL" }, { region: "GYEONGGI" }],
    } as never);

    const result = await profileService.getMoverAccount(5);

    expect(mockedRepository.findMoverAccount).toHaveBeenCalledWith(5);
    expect(result).toEqual({
      userId: 5,
      role: "MOVER",
      name: "김코드",
      email: "driver@example.com",
      phoneNumber: "010-9999-8888",
      hasProfile: true,
      image: "https://img",
      nickName: "김코드",
      career: 8,
      bio: "한 줄 소개",
      description: "상세 설명",
      avgRating: 4.5,
      services: ["SMALL"],
      regions: ["SEOUL", "GYEONGGI"],
    });
  });

  it("프로필이 없으면 hasProfile: false와 빈 값을 반환한다", async () => {
    mockedRepository.findMoverAccount.mockResolvedValue({
      id: 6,
      name: "이영희",
      email: "lee@example.com",
      phoneNumber: "010-1111-2222",
      moverProfile: null,
      moverServices: [],
      moverRegions: [],
    } as never);

    const result = await profileService.getMoverAccount(6);

    expect(result).toEqual({
      userId: 6,
      role: "MOVER",
      name: "이영희",
      email: "lee@example.com",
      phoneNumber: "010-1111-2222",
      hasProfile: false,
      image: null,
      nickName: null,
      career: null,
      bio: null,
      description: null,
      avgRating: null,
      services: [],
      regions: [],
    });
  });

  it("유저가 없으면 404를 던진다", async () => {
    mockedRepository.findMoverAccount.mockResolvedValue(null);

    await expect(profileService.getMoverAccount(999)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
