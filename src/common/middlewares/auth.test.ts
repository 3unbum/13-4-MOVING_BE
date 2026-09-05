import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "../errors/errorCodes";
import { requireAuth, optionalAuth } from "./auth";
import jwtUtil from "../utils/jwt.util";

jest.mock("../utils/jwt.util", () => ({
  __esModule: true,
  default: { verifyToken: jest.fn() },
}));

// requireAuth/optionalAuth는 ACCESS_TOKEN_COOKIE 이름만 참조하므로, env를 요구하는 실제 cookie.util 대신 상수만 흉내낸다
jest.mock("../utils/cookie.util", () => ({
  ACCESS_TOKEN_COOKIE: "accessToken",
}));

const mockedJwtUtil = jest.mocked(jwtUtil);

function makeReq(cookies: Record<string, string> = {}) {
  return { cookies } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("requireAuth", () => {
  test("accessToken 쿠키가 없으면 401 ACCESS_TOKEN_INVALID로 next를 호출한다", () => {
    // Setup
    const req = makeReq();
    const next = jest.fn() as unknown as NextFunction;

    // Exercise
    requireAuth(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: ERROR_CODES.ACCESS_TOKEN_INVALID })
    );
    expect(req.user).toBeUndefined();
  });

  test("액세스 토큰 서명이 유효하면 req.user를 채우고 다음 미들웨어로 넘어간다", () => {
    // Setup
    const req = makeReq({ accessToken: "valid-token" });
    const next = jest.fn() as unknown as NextFunction;
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "CUSTOMER" });

    // Exercise
    requireAuth(req, {} as Response, next);

    // Assertion
    expect(mockedJwtUtil.verifyToken).toHaveBeenCalledWith("valid-token", "access");
    expect(req.user).toEqual({ id: 1, role: "CUSTOMER" });
    expect(next).toHaveBeenCalledWith();
  });

  test("액세스 토큰이 만료됐으면 401 ACCESS_TOKEN_EXPIRED로 next를 호출한다", () => {
    // Setup
    const req = makeReq({ accessToken: "expired-token" });
    const next = jest.fn() as unknown as NextFunction;
    const expiredError = new Error("jwt expired");
    expiredError.name = "TokenExpiredError";
    mockedJwtUtil.verifyToken.mockImplementation(() => {
      throw expiredError;
    });

    // Exercise
    requireAuth(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: ERROR_CODES.ACCESS_TOKEN_EXPIRED })
    );
  });

  test("액세스 토큰 서명이 위조됐으면 401 ACCESS_TOKEN_INVALID로 next를 호출한다", () => {
    // Setup
    const req = makeReq({ accessToken: "tampered-token" });
    const next = jest.fn() as unknown as NextFunction;
    mockedJwtUtil.verifyToken.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    // Exercise
    requireAuth(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: ERROR_CODES.ACCESS_TOKEN_INVALID })
    );
  });

  /** cookie-parser가 아직 안 붙은 것처럼 req.cookies 자체가 없는 극단적인 경우도 방어한다 */
  test("req.cookies 자체가 없어도 401 ACCESS_TOKEN_INVALID로 next를 호출한다", () => {
    // Setup
    const req = {} as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;

    // Exercise
    requireAuth(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: ERROR_CODES.ACCESS_TOKEN_INVALID })
    );
  });
});

describe("optionalAuth", () => {
  test("accessToken 쿠키가 없어도 에러 없이 통과시킨다", () => {
    // Setup
    const req = makeReq();
    const next = jest.fn() as unknown as NextFunction;

    // Exercise
    optionalAuth(req, {} as Response, next);

    // Assertion
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  test("액세스 토큰이 유효하면 req.user를 채우고 통과시킨다", () => {
    // Setup
    const req = makeReq({ accessToken: "valid-token" });
    const next = jest.fn() as unknown as NextFunction;
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "MOVER" });

    // Exercise
    optionalAuth(req, {} as Response, next);

    // Assertion
    expect(req.user).toEqual({ id: 1, role: "MOVER" });
    expect(next).toHaveBeenCalledWith();
  });

  test("액세스 토큰이 위조되거나 만료됐어도 에러 없이 통과시킨다", () => {
    // Setup
    const req = makeReq({ accessToken: "invalid-token" });
    const next = jest.fn() as unknown as NextFunction;
    mockedJwtUtil.verifyToken.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    // Exercise
    optionalAuth(req, {} as Response, next);

    // Assertion
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  /** cookie-parser가 아직 안 붙은 것처럼 req.cookies 자체가 없는 극단적인 경우도 에러 없이 통과시킨다 */
  test("req.cookies 자체가 없어도 에러 없이 통과시킨다", () => {
    // Setup
    const req = {} as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;

    // Exercise
    optionalAuth(req, {} as Response, next);

    // Assertion
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});
