import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { profileService } from "./profile.service";

export const profileController = {
  uploadImage: (async (req, res, next) => {
    try {
      const file = req.file as Express.MulterS3.File | undefined;
      if (!file) {
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "이미지 파일이 필요합니다.");
      }

      const result = profileService.buildImageUploadResult(file);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
