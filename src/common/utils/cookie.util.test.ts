import type { Response } from "express";
import ms from "ms";

/**
 * cookie.util은 모듈 로드 시점의 isProduction 값을 baseCookieOptions에 그대로 굽는다.
 * dev/prod 두 분기를 다 검증하려면 매번 env를 다르게 mock한 새 모듈 인스턴스가 필요해서
 * jest.isolateModules + jest.doMock으로 그때그때 새로 로드한다.
 */
function loadCookieUtil(isProduction: boolean) {
  let mod!: typeof import("./cookie.util");
  jest.isolateModules(() => {
    jest.doMock("../../config/env", () => ({
      env: { JWT_EXPIRES_IN: "1h", JWT_REFRESH_EXPIRES_IN: "14d" },
      isProduction,
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules로 다시 로드하려면 동적 require가 필요하다
    mod = require("./cookie.util");
  });
  return mod;
}

function makeRes() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

describe("setAccessTokenCookie", () => {
  test("개발 환경에서는 secure: false로 accessToken 쿠키를 굽는다", () => {
    // Setup
    const { setAccessTokenCookie, ACCESS_TOKEN_COOKIE } = loadCookieUtil(false);
    const res = makeRes();

    // Exercise
    setAccessTokenCookie(res, "access-token-value");

    // Assertion
    expect(res.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, "access-token-value", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: ms("1h"),
    });
  });

  test("프로덕션 환경에서는 secure: true로 accessToken 쿠키를 굽는다", () => {
    // Setup
    const { setAccessTokenCookie, ACCESS_TOKEN_COOKIE } = loadCookieUtil(true);
    const res = makeRes();

    // Exercise
    setAccessTokenCookie(res, "access-token-value");

    // Assertion
    expect(res.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, "access-token-value", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: ms("1h"),
    });
  });
});

describe("setAuthCookies", () => {
  test("accessToken과 refreshToken 쿠키를 각자의 만료 시간(JWT_EXPIRES_IN/JWT_REFRESH_EXPIRES_IN)으로 굽는다", () => {
    // Setup
    const { setAuthCookies, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } = loadCookieUtil(false);
    const res = makeRes();

    // Exercise
    setAuthCookies(res, { accessToken: "access-value", refreshToken: "refresh-value" });

    // Assertion
    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE,
      "access-value",
      expect.objectContaining({ maxAge: ms("1h") })
    );
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      "refresh-value",
      expect.objectContaining({ maxAge: ms("14d") })
    );
  });
});

describe("clearAuthCookies", () => {
  test("accessToken과 refreshToken 쿠키를 CSRF 방지 옵션(httpOnly/sameSite=lax)까지 맞춰 모두 지운다", () => {
    // Setup
    const { clearAuthCookies, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } = loadCookieUtil(false);
    const res = makeRes();

    // Exercise
    clearAuthCookies(res);

    // Assertion
    const expectedOptions = { httpOnly: true, secure: false, sameSite: "lax", path: "/" };
    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, expectedOptions);
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE, expectedOptions);
  });
});
