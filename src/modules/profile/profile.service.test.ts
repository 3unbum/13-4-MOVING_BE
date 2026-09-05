import { ERROR_CODES } from "../../common/errors/errorCodes";
import { profileService } from "./profile.service";
import { profileRepository } from "./profile.repository";
import type { CustomerProfileCreateDto, MoverProfileCreateDto } from "./profile.schema";

jest.mock("./profile.repository", () => ({
  profileRepository: {
    exists: jest.fn(),
    createCustomerProfile: jest.fn(),
    createMoverProfile: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(profileRepository);

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
});
