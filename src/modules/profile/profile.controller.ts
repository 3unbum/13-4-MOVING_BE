import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { detectImageType } from "../../common/utils/fileSignature.util";
import { profileService } from "./profile.service";

export const profileController = {
  uploadImage: (async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "이미지 파일이 필요합니다.");
      }

      // 클라이언트가 보낸 mimetype/파일명은 신뢰하지 않고 실제 바이트로 형식을 재검증합니다.
      const detected = detectImageType(file.buffer);
      if (!detected) {
        throw new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          "지원하지 않는 이미지 형식입니다. (jpeg, png, webp만 가능)"
        );
      }

      const result = await profileService.uploadProfileImage(file.buffer, detected);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
