import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError";

/**
 * 로그인 필수. passport-jwt 전략 통과 후 req.user가 채워집니다.
 * TODO: passport.authenticate("jwt", { session: false })와 연결
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  next();
};
