import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "../errors/errorCodes";
import { requireAuth, optionalAuth } from "./auth";
import jwtUtil from "../utils/jwt.util";
import { authRepository } from "../../modules/auth/auth.repository";

jest.mock("../utils/jwt.util", () => ({
  __esModule: true,
  default: { verifyToken: jest.fn() },
}));

// requireAuth/optionalAuth는 ACCESS_TOKEN_COOKIE 이름만 참조하므로, env를 요구하는 실제 cookie.util 대신 상수만 흉내낸다
jest.mock("../utils/cookie.util", () => ({
  ACCESS_TOKEN_COOKIE: "accessToken",
}));

jest.mock("../../modules/auth/auth.repository", () => ({
  authRepository: { isActiveUser: jest.fn() },
}));

const mockedJwtUtil = jest.mocked(jwtUtil);
const mockedAuthRepository = jest.mocked(authRepository);

function makeReq(cookies: Record<string, string> = {}) {
  return { cookies } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("requireAuth", () => {
  test("accessToken 쿠키가 없으면 401 ACCESS_TOKEN_INVALID로 next를 호출한다", async () => {
    // Setup
    const req = makeReq();
    const next = jest.fn() as unknown as NextFunction;

    // Exercise
    await requireAuth(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: ERROR_CODES.ACCESS_TOKEN_INVALID })
    );
    expect(req.user).toBeUndefined();
  });

  test("액세스 토큰 서명이 유효하고 탈퇴하지 않은 계정이면 req.user를 채우고 다음 미들웨어로 넘어간다", async () => {
    // Setup
    const req = makeReq({ accessToken: "valid-token" });
    const next = jest.fn() as unknown as NextFunction;
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "CUSTOMER" });
    mockedAuthRepository.isActiveUser.mockResolvedValue(true);

    // Exercise
    await requireAuth(req, {} as Response, next);

    // Assertion
    expect(mockedJwtUtil.verifyToken).toHaveBeenCalledWith("valid-token", "access");
    expect(mockedAuthRepository.isActiveUser).toHaveBeenCalledWith(1);
    expect(req.user).toEqual({ id: 1, role: "CUSTOMER" });
    expect(next).toHaveBeenCalledWith();
  });

  /** 탈퇴 전에 발급된 access token은 만료 전까지 서명이 유효하다 */
  test("탈퇴했거나 없는 계정의 토큰이면 401 ACCESS_TOKEN_INVALID로 next를 호출하고 req.user를 채우지 않는다", async () => {
    // Setup
    const req = makeReq({ accessToken: "deleted-user-token" });
    const next = jest.fn() as unknown as NextFunction;
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "MOVER" });
    mockedAuthRepository.isActiveUser.mockResolvedValue(false);

    // Exercise
    await requireAuth(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: ERROR_CODES.ACCESS_TOKEN_INVALID })
    );
    expect(req.user).toBeUndefined();
  });

  test("계정 조회 중 DB 에러가 나면 그 에러로 next를 호출한다", async () => {
    // Setup
    const req = makeReq({ accessToken: "valid-token" });
    const next = jest.fn() as unknown as NextFunction;
    const dbError = new Error("connection lost");
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "CUSTOMER" });
    mockedAuthRepository.isActiveUser.mockRejectedValue(dbError);

    // Exercise
    await requireAuth(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(dbError);
    expect(req.user).toBeUndefined();
  });

  test("액세스 토큰이 만료됐으면 401 ACCESS_TOKEN_EXPIRED로 next를 호출한다", async () => {
    // Setup
    const req = makeReq({ accessToken: "expired-token" });
    const next = jest.fn() as unknown as NextFunction;
    const expiredError = new Error("jwt expired");
    expiredError.name = "TokenExpiredError";
    mockedJwtUtil.verifyToken.mockImplementation(() => {
      throw expiredError;
    });

    // Exercise
    await requireAuth(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: ERROR_CODES.ACCESS_TOKEN_EXPIRED })
    );
  });

  test("액세스 토큰 서명이 위조됐으면 401 ACCESS_TOKEN_INVALID로 next를 호출한다", async () => {
    // Setup
    const req = makeReq({ accessToken: "tampered-token" });
    const next = jest.fn() as unknown as NextFunction;
    mockedJwtUtil.verifyToken.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    // Exercise
    await requireAuth(req, {} as Response, next);

    // Assertion
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: ERROR_CODES.ACCESS_TOKEN_INVALID })
    );
  });

  /** cookie-parser가 아직 안 붙은 것처럼 req.cookies 자체가 없는 극단적인 경우도 방어한다 */
  test("req.cookies 자체가 없어도 401 ACCESS_TOKEN_INVALID로 next를 호출한다", async () => {
    // Setup
    const req = {} as unknown as Request;
    const next = jest.fn() as unknown as NextFunction;

    // Exercise
    await requireAuth(req, {} as Response, next);

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
