import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { requireAuth } from "../../common/middlewares/auth";
import { requireRole } from "../../common/middlewares/role";
import { requireProfile } from "../../common/middlewares/profile";
import { validate } from "../../common/middlewares/validate";
import { profileEditCodeRateLimiters } from "../../common/middlewares/rateLimit";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { PROFILE_IMAGE_MAX_SIZE_BYTES, isAllowedImageMimeType } from "./profile.constants";
import {
  customerProfileCreateSchema,
  moverProfileCreateSchema,
  customerProfileUpdateSchema,
  moverProfileUpdateSchema,
  verifyProfileEmailVerificationCodeSchema,
} from "./profile.schema";
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
      next(
        new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `이미지 용량은 ${maxMb}MB를 초과할 수 없습니다.`
        )
      );
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

/**
 * @swagger
 * /profiles/image:
 *   post:
 *     tags: [Profile]
 *     summary: 프로필 이미지 업로드
 *     description: |
 *       이미지 파일을 받아 S3에 업로드하고 URL을 반환합니다.
 *       클라이언트가 보낸 mimetype/파일명은 신뢰하지 않고 실제 바이트로 형식을 재검증합니다.
 *       반환된 imageUrl을 프로필 등록/수정 API의 image 필드에 그대로 사용하세요.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: jpeg, png, webp만 허용, 최대 5MB
 *     responses:
 *       201:
 *         description: 업로드 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     imageUrl: { type: string }
 *       400:
 *         description: 이미지 파일 누락, 지원하지 않는 형식, 5MB 초과 (VALIDATION_ERROR)
 *       401:
 *         description: 인증되지 않음
 */
router.post("/image", requireAuth, uploadSingleImage, profileController.uploadImage);

router.post(
  "/customer",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(customerProfileCreateSchema),
  profileController.registerCustomer
);

router.post(
  "/mover",
  requireAuth,
  requireRole("MOVER"),
  validate(moverProfileCreateSchema),
  profileController.registerMover
);

// 가입 직후(프로필 미등록) 상태에서도 계정 정보를 봐야 해서 requireProfile은 걸지 않습니다.
router.get("/customer", requireAuth, requireRole("CUSTOMER"), profileController.getCustomerAccount);
router.get("/mover", requireAuth, requireRole("MOVER"), profileController.getMoverAccount);

/**
 * @swagger
 * /profiles/customer:
 *   patch:
 *     tags: [Profile]
 *     summary: 일반 유저 내 정보 수정
 *     description: |
 *       계정 정보(name/phoneNumber/password)와 프로필 정보(image/region/services)를
 *       한 요청으로 부분 수정합니다. 모든 필드는 optional입니다.
 *       newPassword를 보낼 경우 currentPassword가 필수입니다.
 *       프로필이 등록된 유저만 호출할 수 있습니다(requireProfile).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, minLength: 1 }
 *               phoneNumber: { type: string, description: "01[016789]XXXXXXX(X) 형식" }
 *               currentPassword: { type: string, description: "newPassword를 보낼 경우 필수" }
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: 영문 + 숫자 + 특수문자 포함, 72바이트 이하
 *               image: { type: string, nullable: true, description: "POST /profiles/image 응답의 imageUrl, null이면 프로필 이미지 삭제, 생략하면 변경 없음" }
 *               region:
 *                 type: string
 *                 enum: [SEOUL, GYEONGGI, INCHEON, GANGWON, CHUNGBUK, CHUNGNAM, SEJONG, DAEJEON, JEONBUK, JEONNAM, GWANGJU, GYEONGBUK, GYEONGNAM, DAEGU, ULSAN, BUSAN, JEJU]
 *               services:
 *                 type: array
 *                 items: { type: string, enum: [SMALL, HOME, OFFICE] }
 *                 minItems: 1
 *                 description: 중복 값 불가. 보내면 기존 목록을 통째로 교체합니다
 *     responses:
 *       200:
 *         description: 수정된 계정+프로필 정보
 *       400:
 *         description: |
 *           유효성 검사 실패(VALIDATION_ERROR), 프로필 미등록(PROFILE_REQUIRED),
 *           newPassword만 보내고 currentPassword 누락, 소셜 로그인 계정의 비밀번호 변경 시도
 *       401:
 *         description: 인증되지 않음, 또는 currentPassword 불일치 (INVALID_CREDENTIALS)
 *       403:
 *         description: CUSTOMER 계정이 아님 (FORBIDDEN)
 */
router.patch(
  "/customer",
  requireAuth,
  requireRole("CUSTOMER"),
  requireProfile,
  validate(customerProfileUpdateSchema),
  profileController.updateCustomerAccount
);

/**
 * @swagger
 * /profiles/mover:
 *   patch:
 *     tags: [Profile]
 *     summary: 기사님 내 정보 수정
 *     description: |
 *       계정 정보(name/phoneNumber/password)와 프로필 정보를 한 요청으로 부분 수정합니다.
 *       모든 필드는 optional입니다. newPassword를 보낼 경우 currentPassword가 필수입니다.
 *       avgRating은 요청 스키마에 필드 자체가 없어 이 API로 수정할 수 없습니다
 *       (리뷰 작성 시 서버가 재계산). 프로필이 등록된 유저만 호출할 수 있습니다(requireProfile).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, minLength: 1 }
 *               phoneNumber: { type: string, description: "01[016789]XXXXXXX(X) 형식" }
 *               currentPassword: { type: string, description: "newPassword를 보낼 경우 필수" }
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: 영문 + 숫자 + 특수문자 포함, 72바이트 이하
 *               image: { type: string, nullable: true, description: "POST /profiles/image 응답의 imageUrl, null이면 프로필 이미지 삭제, 생략하면 변경 없음" }
 *               nickName: { type: string, minLength: 1 }
 *               career: { type: integer, minimum: 0 }
 *               bio: { type: string, minLength: 1 }
 *               description: { type: string, minLength: 1 }
 *               services:
 *                 type: array
 *                 items: { type: string, enum: [SMALL, HOME, OFFICE] }
 *                 minItems: 1
 *                 description: 중복 값 불가. 보내면 기존 목록을 통째로 교체합니다
 *               regions:
 *                 type: array
 *                 items: { type: string, enum: [SEOUL, GYEONGGI, INCHEON, GANGWON, CHUNGBUK, CHUNGNAM, SEJONG, DAEJEON, JEONBUK, JEONNAM, GWANGJU, GYEONGBUK, GYEONGNAM, DAEGU, ULSAN, BUSAN, JEJU] }
 *                 minItems: 1
 *                 description: 중복 값 불가. 보내면 기존 목록을 통째로 교체합니다
 *     responses:
 *       200:
 *         description: 수정된 계정+프로필 정보 (avgRating 포함)
 *       400:
 *         description: |
 *           유효성 검사 실패(VALIDATION_ERROR), 프로필 미등록(PROFILE_REQUIRED),
 *           newPassword만 보내고 currentPassword 누락, 소셜 로그인 계정의 비밀번호 변경 시도
 *       401:
 *         description: 인증되지 않음, 또는 currentPassword 불일치 (INVALID_CREDENTIALS)
 *       403:
 *         description: MOVER 계정이 아님 (FORBIDDEN)
 */
router.patch(
  "/mover",
  requireAuth,
  requireRole("MOVER"),
  requireProfile,
  validate(moverProfileUpdateSchema),
  profileController.updateMoverAccount
);

/**
 * @swagger
 * /profiles/email-verification/send:
 *   post:
 *     tags: [Profile]
 *     summary: 프로필 수정 진입 이메일 인증번호 발송
 *     description: |
 *       내 정보 수정 화면 진입 시 본인 확인용 인증번호를 로그인 계정 이메일로 발송합니다.
 *       소셜 로그인 계정도 비밀번호 없이 동일하게 이 절차로 본인 확인을 합니다.
 *       비밀번호 재설정(찾기) 인증번호와는 별개의 테이블/절차입니다.
 *       1분에 1회, 1시간에 5회, 1일에 10회로 제한됩니다.
 *     responses:
 *       204:
 *         description: 인증번호 메일 발송 완료
 *       401:
 *         description: 인증되지 않음
 *       429:
 *         description: 요청 횟수 초과 (TOO_MANY_REQUESTS)
 *       500:
 *         description: |
 *           메일 발송 실패(INTERNAL_ERROR). 비밀번호 재설정과 달리 로그인한 본인에게 보내는 것이라
 *           실패를 숨기지 않습니다. 인증번호는 이미 새로 만들어진 상태이며, 요청 제한에는 포함되므로 1분 뒤 다시 요청해주세요.
 */
router.post(
  "/email-verification/send",
  requireAuth,
  ...profileEditCodeRateLimiters,
  profileController.sendProfileEmailVerificationCode
);

/**
 * @swagger
 * /profiles/email-verification/verify:
 *   post:
 *     tags: [Profile]
 *     summary: 프로필 수정 진입 이메일 인증번호 확인
 *     description: |
 *       발송된 6자리 인증번호를 확인합니다. 성공 시 별도 토큰 발급 없이 현재 세션에서
 *       내 정보 수정 화면 진입이 허용된 것으로 간주합니다(PATCH /profiles/customer|mover
 *       자체는 기존처럼 requireAuth + requireProfile로만 보호됩니다).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, description: "6자리 숫자" }
 *     responses:
 *       204:
 *         description: 인증 성공
 *       400:
 *         description: |
 *           유효성 검사 실패(VALIDATION_ERROR), 인증번호 불일치(INVALID_PROFILE_EDIT_CODE),
 *           만료(PROFILE_EDIT_CODE_EXPIRED), 시도 횟수 초과(PROFILE_EDIT_CODE_ATTEMPTS_EXCEEDED)
 *       401:
 *         description: 인증되지 않음
 */
router.post(
  "/email-verification/verify",
  requireAuth,
  validate(verifyProfileEmailVerificationCodeSchema),
  profileController.verifyProfileEmailVerificationCode
);

export default router;
