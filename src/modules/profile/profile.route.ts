import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import multerS3 from "multer-s3";
import { randomUUID } from "crypto";
import { requireAuth } from "../../common/middlewares/auth";
import { s3Client, S3_BUCKET_NAME } from "../../config/s3";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { PROFILE_IMAGE_MAX_SIZE_BYTES, isAllowedImageMimeType } from "./profile.schema";
import { profileController } from "./profile.controller";

const router = Router();

const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (_req, file, cb) => {
      const ext = file.originalname.split(".").pop();
      cb(null, `profile/${randomUUID()}.${ext}`);
    },
  }),
  limits: { fileSize: PROFILE_IMAGE_MAX_SIZE_BYTES },
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
