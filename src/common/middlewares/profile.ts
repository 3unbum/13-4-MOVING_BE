import type { RequestHandler } from "express";
import { profileRepository } from "../../modules/profile/profile.repository";
import { AppError } from "../errors/AppError";
import { ERROR_CODES } from "../errors/errorCodes";

/**
 * 프로필 등록 게이트. 미등록 시 전용 기능 접근을 막습니다.
 * 주의: 프로필 등록 API 자체에는 적용하지 마세요 (무한 루프).
 */
export const requireProfile: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }

    const hasProfile = await profileRepository.exists(req.user.id, req.user.role);
    if (!hasProfile) {
      next(AppError.badRequest(ERROR_CODES.PROFILE_REQUIRED, "프로필 등록이 필요합니다"));
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
