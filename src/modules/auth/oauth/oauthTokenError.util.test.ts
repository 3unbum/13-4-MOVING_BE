import { AppError } from "../../../common/errors/AppError";
import { ERROR_CODES } from "../../../common/errors/errorCodes";
import { classifyTokenExchangeError } from "./oauthTokenError.util";

function makeResponse(jsonImpl: () => Promise<unknown>) {
  return { json: jest.fn(jsonImpl) } as unknown as Response;
}

describe("classifyTokenExchangeError", () => {
  test("error가 invalid_grant면 401 INVALID_OAUTH_CODE를 반환한다", async () => {
    // Setup
    const response = makeResponse(() => Promise.resolve({ error: "invalid_grant" }));

    // Exercise
    const result = await classifyTokenExchangeError(response, "구글");

    // Assertion
    expect(result).toBeInstanceOf(AppError);
    expect(result.statusCode).toBe(401);
    expect(result.code).toBe(ERROR_CODES.INVALID_OAUTH_CODE);
    expect(result.message).toBe("구글 인가 코드가 유효하지 않습니다");
  });

  test("error가 invalid_grant가 아닌 다른 값이면 502 OAUTH_PROVIDER_ERROR를 반환한다", async () => {
    // Setup
    const response = makeResponse(() => Promise.resolve({ error: "invalid_client" }));

    // Exercise
    const result = await classifyTokenExchangeError(response, "카카오");

    // Assertion
    expect(result.statusCode).toBe(502);
    expect(result.code).toBe(ERROR_CODES.OAUTH_PROVIDER_ERROR);
    expect(result.message).toBe("카카오 토큰 교환에 실패했습니다");
  });

  test("body에 error 필드 자체가 없으면 502 OAUTH_PROVIDER_ERROR를 반환한다", async () => {
    // Setup
    const response = makeResponse(() => Promise.resolve({}));

    // Exercise
    const result = await classifyTokenExchangeError(response, "네이버");

    // Assertion
    expect(result.statusCode).toBe(502);
    expect(result.code).toBe(ERROR_CODES.OAUTH_PROVIDER_ERROR);
  });

  /** provider가 JSON이 아닌 응답(예: HTML 에러 페이지)을 줘서 response.json()이 실패하는 경우까지 방어한다 */
  test("응답 body가 JSON이 아니어서 파싱이 실패해도 502 OAUTH_PROVIDER_ERROR를 반환한다", async () => {
    // Setup
    const response = makeResponse(() => Promise.reject(new Error("not json")));

    // Exercise
    const result = await classifyTokenExchangeError(response, "구글");

    // Assertion
    expect(result.statusCode).toBe(502);
    expect(result.code).toBe(ERROR_CODES.OAUTH_PROVIDER_ERROR);
  });
});
