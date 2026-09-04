import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { requireAuth } from "../../common/middlewares/auth";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { PROFILE_IMAGE_MAX_SIZE_BYTES, isAllowedImageMimeType } from "./profile.constants";
import { profileController } from "./profile.controller";

const router = Router();

// 매직 넘버 검증 전까지는 S3에 바로 스트리밍하지 않고 메모리에 담아 검사합니다.
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

function uploadSingleImage(req: Request, res: Response, next: NextFunction) {
  upload.single("image")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      const maxMb = PROFILE_IMAGE_MAX_SIZE_BYTES / (1024 * 1024);
      next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, `이미지 용량은 ${maxMb}MB를 초과할 수 없습니다.`));
      return;
    }

    if (err instanceof Error && err.message === "INVALID_FILE_TYPE") {
      next(
        new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          "지원하지 않는 이미지 형식입니다. (jpeg, png, webp만 가능)"
        )
      );
      return;
    }

    next(err);
  });
}

router.post("/image", requireAuth, uploadSingleImage, profileController.uploadImage);

export default router;
