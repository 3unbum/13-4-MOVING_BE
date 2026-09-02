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
