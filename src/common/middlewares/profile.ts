import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { ERROR_CODES } from "../errors/errorCodes";

/**
 * 프로필 등록 게이트.
 * 요구사항: "프로필을 등록하기 전에는 각 유저 타입에 맞는 전용 기능에 접근할 수 없습니다"
 *
 * 주의: 프로필 등록 API 자체에는 적용하지 마세요 (무한 루프).
 *
 * TODO: customer_profile / mover_profile row 존재 여부 조회 후 구현
 */
export const requireProfile: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }

  // TODO: 프로필 존재 여부 확인
  // const hasProfile = await profileRepository.exists(req.user.id, req.user.role);
  // if (!hasProfile) {
  //   next(AppError.badRequest(ERROR_CODES.PROFILE_REQUIRED, "프로필 등록이 필요합니다"));
  //   return;
  // }

  void ERROR_CODES;
  next();
};
