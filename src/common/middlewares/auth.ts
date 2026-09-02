import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { ERROR_CODES } from "../errors/errorCodes";
import jwtUtil from "../utils/jwt.util";
import { ACCESS_TOKEN_COOKIE } from "../utils/cookie.util";

/**
 * 로그인 필수. httpOnly 쿠키의 access token을 검증해 req.user를 채웁니다.
 * 만료/위조를 구분해 응답해야 프론트가 만료 시에만 /auth/refresh로 재시도할 수 있습니다.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE] ?? null;

  if (!token) {
    next(new AppError(401, ERROR_CODES.ACCESS_TOKEN_INVALID, "인증 토큰이 없습니다"));
    return;
  }

  try {
    const decoded = jwtUtil.verifyToken(token, "access");
    req.user = { id: decoded.userId, role: decoded.role };
    next();
  } catch (error) {
    const isExpired = error instanceof Error && error.name === "TokenExpiredError";
    next(
      new AppError(
        401,
        isExpired ? ERROR_CODES.ACCESS_TOKEN_EXPIRED : ERROR_CODES.ACCESS_TOKEN_INVALID,
        isExpired ? "토큰이 만료되었습니다" : "유효하지 않은 토큰입니다"
      )
    );
  }
};

/**
 * 선택 인증. public API에서 로그인 유저만 추가 정보를 내려줄 때 사용합니다.
 * 토큰이 없거나 만료/위조여도 요청은 통과시키고 req.user는 비워 둡니다.
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwtUtil.verifyToken(token, "access");
    req.user = { id: decoded.userId, role: decoded.role };
  } catch {
    // public API — 잘못된 토큰은 무시
  }

  next();
};
