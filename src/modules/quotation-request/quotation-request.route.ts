import { Router } from "express";
import { requireAuth } from "@/common/middlewares/auth";
import { requireProfile } from "@/common/middlewares/profile";
import { requireRole } from "@/common/middlewares/role";
import { validate } from "@/common/middlewares/validate";
import { quotationRequestController } from "@/modules/quotation-request/quotation-request.controller";
import {
  quotationRequestCreateSchema,
  quotationRequestIdParamsSchema,
  quotationRequestListQuerySchema,
  targetedRequestCreateSchema,
} from "@/modules/quotation-request/quotation-request.schema";

const router = Router();

/**
 * @swagger
 * /quotation-requests:
 *   post:
 *     tags: [QuotationRequests]
 *     summary: 견적 요청 생성 (#15)
 *     description: |
 *       활성 요청(PENDING·ASSIGNED)이 이미 있으면 생성할 수 없습니다.
 *       생성 후 출발지 지역 기사님들에게 NEW_REQUEST 알림이 발송됩니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, movingDate, from, to]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [SMALL, HOME, OFFICE]
 *               movingDate:
 *                 type: string
 *                 format: date
 *                 description: 당일 이하 날짜는 거부됩니다
 *               from:
 *                 $ref: '#/components/schemas/Address'
 *               to:
 *                 $ref: '#/components/schemas/Address'
 *     responses:
 *       201:
 *         description: 생성된 견적 요청
 *       400:
 *         description: 유효성 검사 실패 (이사일·주소·필수 필드)
 *       409:
 *         description: 활성 요청이 이미 존재함 (ACTIVE_REQUEST_EXISTS)
 */
router.post(
  "/",
  requireAuth,
  requireRole("CUSTOMER"),
  requireProfile,
  validate(quotationRequestCreateSchema),
  quotationRequestController.create
);

/**
 * @swagger
 * /quotation-requests:
 *   get:
 *     tags: [QuotationRequests]
 *     summary: 활성 요청 조회 또는 내 요청 이력 (#16, #17)
 *     description: |
 *       `status=pending`이면 활성 요청 1건(없으면 null),
 *       생략하면 내 요청 이력을 페이지네이션으로 반환합니다.
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending] }
 *         description: pending이면 활성 요청 1건만 조회
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *     responses:
 *       200:
 *         description: 활성 요청 1건 또는 이력 목록
 *       400:
 *         description: 쿼리 파라미터 유효성 검사 실패
 */
router.get(
  "/",
  requireAuth,
  requireRole("CUSTOMER"),
  requireProfile,
  validate(quotationRequestListQuerySchema, "query"),
  quotationRequestController.list
);

/**
 * @swagger
 * /quotation-requests/{id}:
 *   get:
 *     tags: [QuotationRequests]
 *     summary: 견적 요청 상세 조회 (#18)
 *     description: 지정 기사님 목록(targetedRequests)을 함께 반환합니다. 본인 요청만 조회 가능합니다.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: 견적 요청 상세
 *       400:
 *         description: id가 양의 정수가 아님
 *       403:
 *         description: 본인 요청이 아님 (FORBIDDEN)
 *       404:
 *         description: 요청을 찾을 수 없음 (NOT_FOUND)
 */
router.get(
  "/:id",
  requireAuth,
  requireRole("CUSTOMER"),
  requireProfile,
  validate(quotationRequestIdParamsSchema, "params"),
  quotationRequestController.findById
);

/**
 * @swagger
 * /quotation-requests/{id}/targeted-requests:
 *   post:
 *     tags: [QuotationRequests]
 *     summary: 지정 견적 요청 (#19)
 *     description: |
 *       활성 요청 1건당 기사님 최대 3명까지 지정할 수 있습니다.
 *       지정 후 해당 기사님에게 NEW_REQUEST 알림이 발송됩니다.
 *       지정 취소는 MVP 범위에서 제외되었습니다.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *         description: 견적 요청 id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [moverId]
 *             properties:
 *               moverId:
 *                 type: integer
 *                 minimum: 1
 *                 description: 지정할 기사님의 user id
 *     responses:
 *       201:
 *         description: 생성된 지정 견적 요청
 *       400:
 *         description: |
 *           유효성 검사 실패, 이미 종료된 요청(NO_ACTIVE_REQUEST),
 *           지정 3명 초과(TARGET_LIMIT_EXCEEDED)
 *       403:
 *         description: 본인 요청이 아님 (FORBIDDEN)
 *       404:
 *         description: 요청 또는 기사님을 찾을 수 없음 (NOT_FOUND)
 *       409:
 *         description: |
 *           이미 지정한 기사님(ALREADY_TARGETED),
 *           동시 요청이 몰려 처리 실패(CONCURRENT_REQUEST_CONFLICT)
 */
router.post(
  "/:id/targeted-requests",
  requireAuth,
  requireRole("CUSTOMER"),
  requireProfile,
  validate(quotationRequestIdParamsSchema, "params"),
  validate(targetedRequestCreateSchema),
  quotationRequestController.createTargeted
);

export default router;
