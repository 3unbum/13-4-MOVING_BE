import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError";

/**
 * 로그인 필수. JWT 검증 미들웨어 통과 후 req.user가 채워집니다.
 * TODO: Authorization 헤더의 accessToken을 jsonwebtoken으로 직접 검증해 req.user에 주입
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  next();
};
