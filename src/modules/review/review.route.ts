import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { requireRole } from "../../common/middlewares/role";
import { validate } from "../../common/middlewares/validate";
import { reviewController } from "./review.controller";
import { uploadReviewImageFile } from "./review.upload";
import {
  confirmReviewSchema,
  deleteReviewImageSchema,
  reviewIdParamSchema,
  reviewListQuerySchema,
} from "./review.schema";

const router = Router();

router.get(
  "/reviews/writable",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(reviewListQuerySchema, "query"),
  reviewController.listWritable
);

router.get(
  "/reviews/my",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(reviewListQuerySchema, "query"),
  reviewController.listWritten
);

/**
 * @swagger
 * /reviews/{id}/images:
 *   post:
 *     tags: [Reviews]
 *     summary: 리뷰 사진 추가
 *     description: |
 *       본인 리뷰이면 작성 전·후 모두 받을 수 있습니다.
 *       multipart 필드 `image` 한 장. jpeg, png, webp, 최대 5MB.
 *       매직 넘버로 형식을 다시 확인하고, 키는 `review/{reviewId}/{uuid}.{확장자}`입니다.
 *       리뷰당 3장을 넘으면 400입니다.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
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
 *         description: 파일 누락, 형식 오류, 5MB 초과, 이미 3장
 *       403:
 *         description: 본인 리뷰가 아님
 *       404:
 *         description: 리뷰 없음
 *       409:
 *         description: 수정할 수 없는 리뷰
 *   delete:
 *     tags: [Reviews]
 *     summary: 리뷰 사진 삭제
 *     description: 본인 리뷰이면 작성 전·후 모두 삭제할 수 있습니다.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageUrl]
 *             properties:
 *               imageUrl: { type: string }
 *     responses:
 *       204:
 *         description: 삭제 성공
 *       403:
 *         description: 본인 리뷰가 아님
 *       404:
 *         description: 리뷰 또는 사진 없음
 *       409:
 *         description: 수정할 수 없는 리뷰
 */
router.post(
  "/reviews/:id/images",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(reviewIdParamSchema, "params"),
  uploadReviewImageFile,
  reviewController.addImage
);

router.delete(
  "/reviews/:id/images",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(reviewIdParamSchema, "params"),
  validate(deleteReviewImageSchema),
  reviewController.removeImage
);

router.patch(
  "/reviews/:id",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(reviewIdParamSchema, "params"),
  validate(confirmReviewSchema),
  reviewController.confirm
);

router.get(
  "/mover/reviews",
  requireAuth,
  requireRole("MOVER"),
  validate(reviewListQuerySchema, "query"),
  reviewController.listReceived
);

export default router;
