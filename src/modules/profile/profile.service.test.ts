import { profileService } from "./profile.service";
import { profileRepository } from "./profile.repository";

jest.mock("./profile.repository", () => ({
  profileRepository: {
    findCustomerAccount: jest.fn(),
    findMoverAccount: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(profileRepository);

describe("profileService.getCustomerAccount", () => {
  beforeEach(() => jest.clearAllMocks());

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
  beforeEach(() => jest.clearAllMocks());

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
