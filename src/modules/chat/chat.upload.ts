import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { PROFILE_IMAGE_MAX_SIZE_BYTES, isAllowedImageMimeType } from "../profile/profile.constants";

const INVALID_TYPE = "지원하지 않는 이미지 형식입니다. (jpeg, png, webp만 가능)";

// 매직 넘버 검증 전까지는 S3에 바로 보내지 않고 메모리에 담습니다. 프로필 이미지와 같은 한도입니다.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROFILE_IMAGE_MAX_SIZE_BYTES, fields: 0, parts: 2 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImageMimeType(file.mimetype)) {
      cb(new Error("INVALID_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
});

/** multipart의 `image` 파일 한 장을 받습니다. multer 에러는 400으로 바꿔 전달합니다 */
export function uploadChatImageFile(req: Request, res: Response, next: NextFunction) {
  upload.single("image")(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      const maxMb = PROFILE_IMAGE_MAX_SIZE_BYTES / (1024 * 1024);
      return next(
        AppError.badRequest(
          ERROR_CODES.VALIDATION_ERROR,
          `이미지 용량은 ${maxMb}MB를 초과할 수 없습니다.`
        )
      );
    }
    if (err instanceof Error && err.message === "INVALID_FILE_TYPE") {
      return next(AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, INVALID_TYPE));
    }
    // 필드가 섞여 있거나 파일이 둘 이상인 요청 등
    next(
      AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, "이미지 파일 한 장만 보낼 수 있습니다.")
    );
  });
}
