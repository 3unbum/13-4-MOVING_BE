import type { RequestHandler } from "express";
import type { UserRole } from "../types/role";
import { AppError } from "../errors/AppError";

/**
 * 유저 타입별 접근 제어.
 * 예) requireRole("CUSTOMER") — 일반 유저 전용 API
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden("접근 권한이 없습니다"));
      return;
    }
    next();
  };
}
