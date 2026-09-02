import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { requireRole } from "../../common/middlewares/role";
import { requireProfile } from "../../common/middlewares/profile";
import { validate } from "../../common/middlewares/validate";
import {
  estimateCreateSchema,
  estimateRejectSchema,
  estimateListQuerySchema,
  moverRequestQuerySchema,
} from "./estimate.schema";
import { estimateController } from "./estimate.controller";

const router = Router();

router
  /**
   * @swagger
   * /estimates/pending:
   *   get:
   *     tags: [Estimates]
   *     summary: 대기 중인 견적 조회 (#26)
   *     description: 활성 견적 요청에 달린 PENDING 견적 목록. customer 전용.
   *     parameters:
   *       - $ref: '#/components/parameters/cursor'
   *       - $ref: '#/components/parameters/take'
   *       - $ref: '#/components/parameters/status'
   *     responses:
   *       200:
   *         description: 견적 목록
   */
  // #26 — literal path라 :id 라우트보다 먼저 등록해야 함(안 그러면 "pending"이 :id로 매칭됨)
  .get(
    "/estimates/pending",
    requireAuth,
    requireRole("CUSTOMER"),
    requireProfile,
    validate(estimateListQuerySchema, "query"),
    estimateController.getPendingEstimates
  )
  /**
   * @swagger
   * /requests/{quotationRequestId}/estimates:
   *   get:
   *     tags: [Estimates]
   *     summary: 특정 요청에 받은 견적 조회 (#27)
   *     description: 완료된 요청 포함, 본인 소유 견적 요청만 조회 가능. customer 전용.
   *     parameters:
   *       - in: path
   *         name: quotationRequestId
   *         required: true
   *         schema: { type: integer }
   *       - $ref: '#/components/parameters/cursor'
   *       - $ref: '#/components/parameters/take'
   *       - $ref: '#/components/parameters/status'
   *     responses:
   *       200:
   *         description: 견적 목록
   *       403:
   *         description: 본인 요청이 아님
   *       404:
   *         description: 요청 없음
   */
  // #27
  .get(
    "/requests/:quotationRequestId/estimates",
    requireAuth,
    requireRole("CUSTOMER"),
    requireProfile,
    validate(estimateListQuerySchema, "query"),
    estimateController.getQuotationEstimates
  )
  /**
   * @swagger
   * /mover/requests/{id}/estimates:
   *   post:
   *     tags: [Estimates]
   *     summary: 견적 보내기 (#31)
   *     description: 지정견적이면 상한 체크 없이, 일반견적이면 5건 상한 내에서 견적 제시. mover 전용.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *         description: quotationRequestId
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [price, comment]
   *             properties:
   *               price: { type: integer, minimum: 10000 }
   *               comment: { type: string, minLength: 10, maxLength: 200 }
   *     responses:
   *       201:
   *         description: 견적 생성됨
   *       400:
   *         description: 요청이 활성 상태가 아니거나 일반 견적 상한 초과
   */
  // #31
  .post(
    "/mover/requests/:id/estimates",
    requireAuth,
    requireRole("MOVER"),
    requireProfile,
    validate(estimateCreateSchema),
    estimateController.save
  )
  /**
   * @swagger
   * /mover/requests/{id}/reject:
   *   post:
   *     tags: [Estimates]
   *     summary: 요청 반려 (#32)
   *     description: 지정견적 요청을 받은 mover만 반려 가능.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *         description: quotationRequestId
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [comment]
   *             properties:
   *               comment: { type: string, minLength: 10, maxLength: 200 }
   *     responses:
   *       201:
   *         description: 반려 처리됨
   *       403:
   *         description: 지정된 견적 요청이 아님
   */
  // #32
  .post(
    "/mover/requests/:id/reject",
    requireAuth,
    requireRole("MOVER"),
    requireProfile,
    validate(estimateRejectSchema),
    estimateController.reject
  )
  /**
   * @swagger
   * /mover/estimates:
   *   get:
   *     tags: [Estimates]
   *     summary: 내 견적 관리 (#33)
   *     description: mover 본인이 보낸 견적 목록. status로 확정/반려 필터.
   *     parameters:
   *       - $ref: '#/components/parameters/cursor'
   *       - $ref: '#/components/parameters/take'
   *       - $ref: '#/components/parameters/status'
   *     responses:
   *       200:
   *         description: 견적 목록
   */
  // #33 — literal path라 이것도 "/mover/estimates/:id"보다 먼저 등록
  .get(
    "/mover/estimates",
    requireAuth,
    requireRole("MOVER"),
    requireProfile,
    validate(estimateListQuerySchema, "query"),
    estimateController.getMoverEstimates
  )
  /**
   * @swagger
   * /mover/estimates/{id}:
   *   get:
   *     tags: [Estimates]
   *     summary: 견적 상세 - mover (#34)
   *     description: 본인이 보낸 견적만 조회 가능.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: 견적 상세
   *       403:
   *         description: 본인 견적이 아님
   *       404:
   *         description: 견적 없음
   */
  // #34
  .get(
    "/mover/estimates/:id",
    requireAuth,
    requireRole("MOVER"),
    requireProfile,
    estimateController.getById
  )
  /**
   * @swagger
   * /estimates/{id}:
   *   get:
   *     tags: [Estimates]
   *     summary: 견적 상세 - customer (#28)
   *     description: 본인이 요청한 견적 요청에 달린 견적만 조회 가능.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: 견적 상세
   *       403:
   *         description: 본인 견적이 아님
   *       404:
   *         description: 견적 없음
   */
  // #28
  .get(
    "/estimates/:id",
    requireAuth,
    requireRole("CUSTOMER"),
    requireProfile,
    estimateController.getById
  )
  /**
   * @swagger
   * /estimates/{id}/confirm:
   *   post:
   *     tags: [Estimates]
   *     summary: 견적 확정 (#29)
   *     description: 본인 요청 + 활성 상태 + PENDING 견적일 때만 확정 가능. customer 전용.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: 확정됨
   *       400:
   *         description: 이미 처리된 견적이거나 요청이 활성 상태가 아님
   *       403:
   *         description: 본인 요청이 아님
   */
  // #29
  .post(
    "/estimates/:id/confirm",
    requireAuth,
    requireRole("CUSTOMER"),
    requireProfile,
    estimateController.confirm
  )
  /**
   * @swagger
   * /mover/requests:
   *   get:
   *     tags: [Estimates]
   *     summary: 받은 요청 목록 (#30)
   *     description: 기본은 전체 최신순. 체크박스 필터/정렬로 좁힘. 이미 견적/반려한 건 항상 제외. mover 전용.
   *     parameters:
   *       - $ref: '#/components/parameters/cursor'
   *       - $ref: '#/components/parameters/take'
   *       - in: query
   *         name: isServiceRegion
   *         schema: { type: boolean }
   *         description: true면 내 서비스 가능 지역 요청만
   *       - in: query
   *         name: isTargeted
   *         schema: { type: boolean }
   *         description: true면 나에게 지정된 요청만
   *       - in: query
   *         name: category
   *         schema: { type: string, enum: [SMALL, HOME, OFFICE] }
   *         description: 이사 유형 필터
   *       - in: query
   *         name: sort
   *         schema: { type: string, enum: [latest, movingDate, targetedAt] }
   *         description: latest(기본, 등록 최신순) / movingDate(이사 빠른순) / targetedAt(지정받은 시점순)
   *     responses:
   *       200:
   *         description: 요청 목록
   */
  // #30
  .get(
    "/mover/requests",
    requireAuth,
    requireRole("MOVER"),
    requireProfile,
    validate(moverRequestQuerySchema, "query"),
    estimateController.getMoverRequests
  );

export default router;
