import { ERROR_CODES } from "../../../common/errors/errorCodes";
import { AppError } from "../../../common/errors/AppError";
import { googleOAuthProvider } from "./google.provider";
import { classifyTokenExchangeError } from "./oauthTokenError.util";

jest.mock("../../../config/env", () => ({
  env: { GOOGLE_CLIENT_ID: "test-client-id", GOOGLE_CLIENT_SECRET: "test-client-secret" },
}));

jest.mock("./oauthTokenError.util", () => ({
  classifyTokenExchangeError: jest.fn(),
}));

const mockedClassifyTokenExchangeError = jest.mocked(classifyTokenExchangeError);

function makeFetchResponse(ok: boolean, jsonBody: unknown) {
  return { ok, json: jest.fn().mockResolvedValue(jsonBody) };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

const mockedFetch = () => global.fetch as jest.Mock;

describe("googleOAuthProvider.exchangeCodeForProfile", () => {
  test("code와 redirectUri로 토큰을 교환하고, 그 액세스 토큰으로 프로필을 조회해 정규화된 형태로 반환한다", async () => {
    // Setup
    mockedFetch()
      .mockResolvedValueOnce(makeFetchResponse(true, { access_token: "google-access-token" }))
      .mockResolvedValueOnce(
        makeFetchResponse(true, {
          sub: "google-user-id",
          email: "test@moving.com",
          name: "김코드",
          picture: "https://google.com/profile.jpg",
        })
      );

    // Exercise
    const result = await googleOAuthProvider.exchangeCodeForProfile(
      "auth-code",
      "https://app/callback"
    );

    // Assertion
    const [tokenUrl, tokenOptions] = mockedFetch().mock.calls[0];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(tokenOptions.method).toBe("POST");
    expect(Object.fromEntries(tokenOptions.body as URLSearchParams)).toEqual({
      code: "auth-code",
      client_id: "test-client-id",
      client_secret: "test-client-secret",
      redirect_uri: "https://app/callback",
      grant_type: "authorization_code",
    });

    const [profileUrl, profileOptions] = mockedFetch().mock.calls[1];
    expect(profileUrl).toBe("https://www.googleapis.com/oauth2/v3/userinfo");
    expect(profileOptions.headers.Authorization).toBe("Bearer google-access-token");

    expect(result).toEqual({
      providerId: "google-user-id",
      email: "test@moving.com",
      name: "김코드",
      profileImage: "https://google.com/profile.jpg",
    });
  });

  test("구글이 name/picture를 안 내려주면 각각 빈 문자열/null로 대체한다", async () => {
    // Setup
    mockedFetch()
      .mockResolvedValueOnce(makeFetchResponse(true, { access_token: "google-access-token" }))
      .mockResolvedValueOnce(makeFetchResponse(true, { sub: "google-user-id", email: "test@moving.com" }));

    // Exercise
    const result = await googleOAuthProvider.exchangeCodeForProfile(
      "auth-code",
      "https://app/callback"
    );

    // Assertion
    expect(result.name).toBe("");
    expect(result.profileImage).toBeNull();
  });

  test("토큰 교환에 실패하면 classifyTokenExchangeError가 만든 에러를 그대로 던진다", async () => {
    // Setup
    const tokenErrorResponse = makeFetchResponse(false, { error: "invalid_grant" });
    mockedFetch().mockResolvedValueOnce(tokenErrorResponse);
    const classifiedError = AppError.badRequest(
      ERROR_CODES.INVALID_OAUTH_CODE,
      "구글 인가 코드가 유효하지 않습니다"
    );
    mockedClassifyTokenExchangeError.mockResolvedValue(classifiedError);

    // Exercise
    const result = googleOAuthProvider.exchangeCodeForProfile("auth-code", "https://app/callback");

    // Assertion
    await expect(result).rejects.toBe(classifiedError);
    expect(mockedClassifyTokenExchangeError).toHaveBeenCalledWith(tokenErrorResponse, "구글");
    expect(mockedFetch()).toHaveBeenCalledTimes(1);
  });

  test("토큰 교환은 성공했지만 프로필 조회에 실패하면 502 OAUTH_PROVIDER_ERROR를 던진다", async () => {
    // Setup
    mockedFetch()
      .mockResolvedValueOnce(makeFetchResponse(true, { access_token: "google-access-token" }))
      .mockResolvedValueOnce(makeFetchResponse(false, {}));

    // Exercise
    const result = googleOAuthProvider.exchangeCodeForProfile("auth-code", "https://app/callback");

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 502,
      code: ERROR_CODES.OAUTH_PROVIDER_ERROR,
    });
  });
});
