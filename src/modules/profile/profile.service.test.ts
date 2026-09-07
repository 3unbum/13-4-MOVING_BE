import { Prisma } from "../../../generated/prisma/client";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { profileService } from "./profile.service";
import { profileRepository } from "./profile.repository";
import hashUtil from "../../common/utils/hash.util";
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
    updateCustomerAccount: jest.fn(),
    updateMoverAccount: jest.fn(),
  },
}));

jest.mock("../../common/utils/hash.util", () => ({
  __esModule: true,
  default: {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(profileRepository);
const mockedHashUtil = jest.mocked(hashUtil);

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

function makeCustomerUser(overrides = {}) {
  return {
    id: 1,
    name: "홍길동",
    email: "user@example.com",
    phoneNumber: "010-1234-5678",
    password: "hashed-old-password",
    customerProfile: { image: "https://img", region: "SEOUL" },
    customerServices: [{ service: "SMALL" }],
    ...overrides,
  };
}

function makeMoverUser(overrides = {}) {
  return {
    id: 5,
    name: "김코드",
    email: "driver@example.com",
    phoneNumber: "010-9999-8888",
    password: "hashed-old-password",
    moverProfile: {
      image: "https://img",
      nickName: "김코드",
      career: 8,
      bio: "한 줄 소개",
      description: "상세 설명",
      avgRating: { toString: () => "4.5" } as unknown as number,
    },
    moverServices: [{ service: "SMALL" }],
    moverRegions: [{ region: "SEOUL" }],
    ...overrides,
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

describe("profileService.updateCustomerAccount", () => {
  test("비밀번호 변경 없이 계정+프로필 필드를 수정하고 최신 정보를 반환한다", async () => {
    // Setup
    mockedRepository.findCustomerAccount
      .mockResolvedValueOnce(makeCustomerUser() as never)
      .mockResolvedValueOnce(
        makeCustomerUser({
          name: "홍길순",
          customerProfile: { image: "https://img", region: "BUSAN" },
        }) as never
      );

    // Exercise
    const result = await profileService.updateCustomerAccount(1, { name: "홍길순", region: "BUSAN" });

    // Assertion
    expect(mockedRepository.updateCustomerAccount).toHaveBeenCalledWith(1, {
      account: { name: "홍길순" },
      profile: { region: "BUSAN" },
      services: undefined,
    });
    expect(mockedHashUtil.verifyPassword).not.toHaveBeenCalled();
    expect(result.name).toBe("홍길순");
    expect(result.region).toBe("BUSAN");
  });

  test("newPassword와 currentPassword가 맞으면 검증 후 해시해서 저장한다", async () => {
    // Setup
    mockedRepository.findCustomerAccount
      .mockResolvedValueOnce(makeCustomerUser() as never)
      .mockResolvedValueOnce(makeCustomerUser() as never);
    mockedHashUtil.verifyPassword.mockResolvedValue(true);
    mockedHashUtil.hashPassword.mockResolvedValue("hashed-new-password");

    // Exercise
    await profileService.updateCustomerAccount(1, {
      currentPassword: "OldPass1!",
      newPassword: "NewPass1!",
    });

    // Assertion
    expect(mockedHashUtil.verifyPassword).toHaveBeenCalledWith("OldPass1!", "hashed-old-password");
    expect(mockedHashUtil.hashPassword).toHaveBeenCalledWith("NewPass1!");
    expect(mockedRepository.updateCustomerAccount).toHaveBeenCalledWith(1, {
      account: { password: "hashed-new-password" },
      profile: {},
      services: undefined,
    });
  });

  test("currentPassword가 틀리면 401을 던지고 저장하지 않는다", async () => {
    // Setup
    mockedRepository.findCustomerAccount.mockResolvedValueOnce(makeCustomerUser() as never);
    mockedHashUtil.verifyPassword.mockResolvedValue(false);

    // Exercise
    const result = profileService.updateCustomerAccount(1, {
      currentPassword: "WrongPass1!",
      newPassword: "NewPass1!",
    });

    // Assertion
    await expect(result).rejects.toMatchObject({ statusCode: 401 });
    expect(mockedRepository.updateCustomerAccount).not.toHaveBeenCalled();
  });

  test("소셜 로그인 계정(비밀번호 없음)이 newPassword를 보내면 400을 던진다", async () => {
    // Setup
    mockedRepository.findCustomerAccount.mockResolvedValueOnce(
      makeCustomerUser({ password: null }) as never
    );

    // Exercise
    const result = profileService.updateCustomerAccount(1, {
      currentPassword: "Anything1!",
      newPassword: "NewPass1!",
    });

    // Assertion
    await expect(result).rejects.toMatchObject({ statusCode: 400 });
    expect(mockedRepository.updateCustomerAccount).not.toHaveBeenCalled();
  });

  test("유저가 없으면 404를 던진다", async () => {
    // Setup
    mockedRepository.findCustomerAccount.mockResolvedValueOnce(null);

    // Exercise
    const result = profileService.updateCustomerAccount(999, { name: "홍길순" });

    // Assertion
    await expect(result).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("profileService.updateMoverAccount", () => {
  test("계정+프로필+서비스·지역 필드를 수정하고 최신 정보를 반환한다", async () => {
    // Setup
    mockedRepository.findMoverAccount
      .mockResolvedValueOnce(makeMoverUser() as never)
      .mockResolvedValueOnce(
        makeMoverUser({
          moverServices: [{ service: "SMALL" }, { service: "HOME" }],
          moverRegions: [{ region: "SEOUL" }, { region: "GYEONGGI" }],
        }) as never
      );

    // Exercise
    const result = await profileService.updateMoverAccount(5, {
      services: ["SMALL", "HOME"],
      regions: ["SEOUL", "GYEONGGI"],
    });

    // Assertion
    expect(mockedRepository.updateMoverAccount).toHaveBeenCalledWith(5, {
      account: {},
      profile: {},
      services: ["SMALL", "HOME"],
      regions: ["SEOUL", "GYEONGGI"],
    });
    expect(result.services).toEqual(["SMALL", "HOME"]);
    expect(result.regions).toEqual(["SEOUL", "GYEONGGI"]);
  });

  test("currentPassword가 틀리면 401을 던지고 저장하지 않는다", async () => {
    // Setup
    mockedRepository.findMoverAccount.mockResolvedValueOnce(makeMoverUser() as never);
    mockedHashUtil.verifyPassword.mockResolvedValue(false);

    // Exercise
    const result = profileService.updateMoverAccount(5, {
      currentPassword: "WrongPass1!",
      newPassword: "NewPass1!",
    });

    // Assertion
    await expect(result).rejects.toMatchObject({ statusCode: 401 });
    expect(mockedRepository.updateMoverAccount).not.toHaveBeenCalled();
  });

  test("avgRating은 응답 매핑에서만 만들어지며 요청 dto로 전달되지 않는다", async () => {
    // Setup
    mockedRepository.findMoverAccount
      .mockResolvedValueOnce(makeMoverUser() as never)
      .mockResolvedValueOnce(makeMoverUser() as never);

    // Exercise
    // MoverProfileUpdateDto 타입 자체에 avgRating 필드가 없어 전달할 방법이 없음을 문서화하는 테스트
    const result = await profileService.updateMoverAccount(5, { bio: "새 소개" });

    // Assertion
    expect(mockedRepository.updateMoverAccount).toHaveBeenCalledWith(5, {
      account: {},
      profile: { bio: "새 소개" },
      services: undefined,
      regions: undefined,
    });
    expect(result.avgRating).toBe(4.5);
  });

  test("유저가 없으면 404를 던진다", async () => {
    // Setup
    mockedRepository.findMoverAccount.mockResolvedValueOnce(null);

    // Exercise
    const result = profileService.updateMoverAccount(999, { bio: "새 소개" });

    // Assertion
    await expect(result).rejects.toMatchObject({ statusCode: 404 });
  });
});
