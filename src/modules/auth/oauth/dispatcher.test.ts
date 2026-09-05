import { AppError } from "../../../common/errors/AppError";
import { ERROR_CODES } from "../../../common/errors/errorCodes";
import { toSocialProvider, exchangeOAuthCode } from "./dispatcher";
import { googleOAuthProvider } from "./google.provider";
import { kakaoOAuthProvider } from "./kakao.provider";
import { naverOAuthProvider } from "./naver.provider";

jest.mock("./google.provider", () => ({
  googleOAuthProvider: { exchangeCodeForProfile: jest.fn() },
}));

jest.mock("./kakao.provider", () => ({
  kakaoOAuthProvider: { exchangeCodeForProfile: jest.fn() },
}));

jest.mock("./naver.provider", () => ({
  naverOAuthProvider: { exchangeCodeForProfile: jest.fn() },
}));

const mockedGoogle = jest.mocked(googleOAuthProvider);
const mockedKakao = jest.mocked(kakaoOAuthProvider);
const mockedNaver = jest.mocked(naverOAuthProvider);

function makeProfile(providerId = "provider-id") {
  return { providerId, email: "test@moving.com", name: "김코드", profileImage: null };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("toSocialProvider", () => {
  test("google/kakao/naver 문자열을 각각 GOOGLE/KAKAO/NAVER SocialProvider로 변환한다", () => {
    // Exercise & Assertion
    expect(toSocialProvider("google")).toBe("GOOGLE");
    expect(toSocialProvider("kakao")).toBe("KAKAO");
    expect(toSocialProvider("naver")).toBe("NAVER");
  });
});

describe("exchangeOAuthCode", () => {
  test("google이면 구글 provider에 code와 redirectUri를 그대로 넘겨 호출한다", async () => {
    // Setup
    mockedGoogle.exchangeCodeForProfile.mockResolvedValue(makeProfile("google-id"));

    // Exercise
    const result = await exchangeOAuthCode("google", "auth-code", "https://app/callback");

    // Assertion
    expect(mockedGoogle.exchangeCodeForProfile).toHaveBeenCalledWith(
      "auth-code",
      "https://app/callback"
    );
    expect(result).toEqual(makeProfile("google-id"));
  });

  test("kakao면 카카오 provider에 code와 redirectUri를 그대로 넘겨 호출한다", async () => {
    // Setup
    mockedKakao.exchangeCodeForProfile.mockResolvedValue(makeProfile("kakao-id"));

    // Exercise
    const result = await exchangeOAuthCode("kakao", "auth-code", "https://app/callback");

    // Assertion
    expect(mockedKakao.exchangeCodeForProfile).toHaveBeenCalledWith(
      "auth-code",
      "https://app/callback"
    );
    expect(result).toEqual(makeProfile("kakao-id"));
  });

  /** 네이버 API는 redirectUri를 안 받으므로, dispatcher가 이걸 넘기지 않고 code만 넘기는지가 핵심이다 */
  test("naver면 redirectUri 없이 code만 네이버 provider에 넘겨 호출한다", async () => {
    // Setup
    mockedNaver.exchangeCodeForProfile.mockResolvedValue(makeProfile("naver-id"));

    // Exercise
    const result = await exchangeOAuthCode("naver", "auth-code", "https://app/callback");

    // Assertion
    expect(mockedNaver.exchangeCodeForProfile).toHaveBeenCalledWith("auth-code");
    expect(result).toEqual(makeProfile("naver-id"));
  });

  test("provider가 AppError를 던지면 그대로 전파한다", async () => {
    // Setup
    const providerError = AppError.badRequest(ERROR_CODES.INVALID_OAUTH_CODE, "인가 코드가 유효하지 않습니다");
    mockedGoogle.exchangeCodeForProfile.mockRejectedValue(providerError);

    // Exercise
    const result = exchangeOAuthCode("google", "auth-code", "https://app/callback");

    // Assertion
    await expect(result).rejects.toBe(providerError);
  });

  test("provider가 AppError가 아닌 에러를 던지면 502 OAUTH_PROVIDER_ERROR로 감싼다", async () => {
    // Setup
    mockedGoogle.exchangeCodeForProfile.mockRejectedValue(new Error("network down"));

    // Exercise
    const result = exchangeOAuthCode("google", "auth-code", "https://app/callback");

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 502,
      code: ERROR_CODES.OAUTH_PROVIDER_ERROR,
    });
  });
});
