import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { requireRole } from "../../common/middlewares/role";
import { requireProfile } from "../../common/middlewares/profile";
import { validate } from "../../common/middlewares/validate";
import {
  estimateCreateSchema,
  estimateRejectSchema,
  estimateListQuerySchema,
  paymentEstimateListQuerySchema,
  estimatePaySchema,
  extraChargeProposeSchema,
  extraChargeRespondSchema,
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
   * /estimates:
   *   get:
   *     tags: [Estimates]
   *     summary: 내 견적 목록 - 결제 탭 (#140)
   *     description: |
   *       요청과 무관하게 고객이 받은 견적 전체. `paymentStage`로 탭을 가른다.
   *       - 대기 중인 결제: `paymentStage=DUE` (선수금 대기 + 잔금 대기)
   *       - 결제 내역: `paymentStage=PAID` (잔금까지 결제 완료)
   *       customer 전용. 응답 견적에 결제 단계(`paymentStage`: DEPOSIT_DUE | BALANCE_DUE | PAID | NONE)와
   *       `balanceAmount`(잔금), `depositAmount`·`depositDueAt`·`depositPaidAt`, `paymentStatus`·`paidAt`이 포함된다.
   *     parameters:
   *       - $ref: '#/components/parameters/cursor'
   *       - $ref: '#/components/parameters/take'
   *       - $ref: '#/components/parameters/status'
   *       - in: query
   *         name: paymentStage
   *         schema: { type: string, enum: [DUE, PAID] }
   *     responses:
   *       200:
   *         description: 견적 목록
   */
  // #140 — "/estimates/:id"와 세그먼트 수가 달라 충돌하지 않는다
  .get(
    "/estimates",
    requireAuth,
    requireRole("CUSTOMER"),
    requireProfile,
    validate(paymentEstimateListQuerySchema, "query"),
    estimateController.getCustomerEstimates
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
   *     description: |
   *       mover 본인이 보낸 견적 목록. status로 확정/반려 필터.
   *       결제 탭은 `paymentStage=DUE|PAID` (#140). 응답 견적에 결제 단계(`paymentStage`)와 선수금·잔금 정보가 포함된다.
   *     parameters:
   *       - $ref: '#/components/parameters/cursor'
   *       - $ref: '#/components/parameters/take'
   *       - $ref: '#/components/parameters/status'
   *       - in: query
   *         name: paymentStage
   *         schema: { type: string, enum: [DUE, PAID] }
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
    validate(paymentEstimateListQuerySchema, "query"),
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
   *     description: |
   *       본인 요청 + 활성 상태 + PENDING 견적일 때만 확정 가능. customer 전용.
   *       확정하면 선수금(견적의 10%, 10원 단위 내림)과 결제 기한(확정 후 48시간, 이사일 0시 KST를 넘지 않음)이 정해진다.
   *       확정하면 고객·기사님 채팅방이 바로 열린다. 기한 안에 선수금을 결제하지 않으면 확정이 자동 취소되고 채팅방도 닫힌다(삭제).
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
   * /estimates/{id}/extra-charge/respond:
   *   post:
   *     tags: [Estimates]
   *     summary: 추가 금액 승인·거절 (#140)
   *     description: |
   *       기사님이 요청한 추가 금액에 응답한다. customer 전용.
   *       - `APPROVE`: 고른 추가 금액이 잔금에 합산된다.
   *       - `REJECT`: 잔금은 기존 금액 그대로이고 요청은 기록으로 남는다.
   *       고른 건(`chargeIds`)에 같은 결정을 한 번에 적용하며, 모두 응답 대기 상태여야 한다.
   *       응답하지 않은 건이 남아 있으면 잔금을 결제할 수 없다(EXTRA_CHARGE_PENDING). 기사님에게 알림이 간다.
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
   *             required: [decision, chargeIds]
   *             properties:
   *               decision: { type: string, enum: [APPROVE, REJECT] }
   *               chargeIds: { type: array, minItems: 1, items: { type: integer } }
   *     responses:
   *       200:
   *         description: 응답이 반영된 견적
   *       400:
   *         description: 응답할 요청이 없음 (EXTRA_CHARGE_NOT_PENDING)
   *       403:
   *         description: 본인 견적이 아님
   *       404:
   *         description: 견적 없음
   */
  // #140
  .post(
    "/estimates/:id/extra-charge/respond",
    requireAuth,
    requireRole("CUSTOMER"),
    requireProfile,
    validate(extraChargeRespondSchema),
    estimateController.respondExtraCharge
  )
  /**
   * @swagger
   * /estimates/{id}/pay:
   *   post:
   *     tags: [Estimates]
   *     summary: 견적 결제 (#140)
   *     description: |
   *       토스페이먼츠 결제창이 successUrl로 돌려준 `paymentKey`·`orderId`·`amount`를 받아 결제를 승인한다. customer 전용.
   *       `type`으로 선수금과 잔금을 가른다.
   *       - `DEPOSIT`(선수금): 확정됐고 선수금이 설정된 견적을 기한 안에 결제. 결제하면 기사님에게 알림이 간다.
   *         `orderId`는 `moving-deposit-{견적 id}`, `amount`는 `depositAmount`.
   *       - `BALANCE`(잔금): 이사 완료 + 선수금 납부(옛 견적은 선수금 없음) 견적.
   *         `orderId`는 `moving-balance-{견적 id}`, `amount`는 `balanceAmount`(견적가 − 선수금).
   *       - 서버에 `TOSS_SECRET_KEY`(테스트 키)가 있으면 토스 승인 API를 호출한다. 테스트 키는 실제 청구가 없다.
   *       - 동시에 두 번 호출해도 하나만 성공한다(조건부 갱신).
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
   *             required: [type, paymentKey, orderId, amount]
   *             properties:
   *               type: { type: string, enum: [DEPOSIT, BALANCE] }
   *               paymentKey: { type: string }
   *               orderId: { type: string, example: moving-deposit-12 }
   *               amount: { type: integer }
   *     responses:
   *       200:
   *         description: 결제된 견적
   *       400:
   *         description: 결제 단계가 아님(ESTIMATE_NOT_COMPLETED·DEPOSIT_NOT_REQUIRED·DEPOSIT_NOT_PAID), 선수금 기한 만료(DEPOSIT_EXPIRED), 금액·주문 불일치·토스 승인 거절(PAYMENT_FAILED)
   *       403:
   *         description: 본인 견적이 아님
   *       404:
   *         description: 견적 없음
   *       409:
   *         description: 이미 결제한 견적 (ALREADY_PAID)
   */
  // #140
  .post(
    "/estimates/:id/pay",
    requireAuth,
    requireRole("CUSTOMER"),
    requireProfile,
    validate(estimatePaySchema),
    estimateController.pay
  )
  /**
   * @swagger
   * /mover/estimates/{id}/extra-charge:
   *   post:
   *     tags: [Estimates]
   *     summary: 추가 금액 요청 (#140)
   *     description: |
   *       이사가 끝났고 잔금을 아직 결제하지 않은 본인 견적에, 추가 금액과 그 사유를 고객에게 요청한다. mover 전용.
   *       - 견적당 **여러 건** 요청할 수 있다(응답의 `extraCharges` 배열).
   *       - 금액은 1,000원 이상이고, 거절되지 않은 건의 **합계**가 견적 금액의 20% 이내(응답의 `extraChargeMax`, 남은 한도는 `extraChargeRemaining`). 사유는 1~200자(글자 수 최소 제한 없음, 비어 있으면 안 됨).
   *       - 고객에게 알림이 가고, 고객이 승인한 건만 잔금에 합산된다(`balanceAmount`).
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
   *             required: [amount, reason]
   *             properties:
   *               amount: { type: integer, minimum: 1000 }
   *               reason: { type: string, minLength: 1, maxLength: 200 }
   *     responses:
   *       200:
   *         description: 새 추가 금액이 `PROPOSED`로 기록된 견적
   *       400:
   *         description: 이사 미완료(ESTIMATE_NOT_COMPLETED) 또는 상한 초과(EXTRA_CHARGE_TOO_LARGE)
   *       403:
   *         description: 본인이 보낸 견적이 아님
   *       404:
   *         description: 견적 없음
   *       409:
   *         description: 이미 결제함(ALREADY_PAID)
   */
  // #140
  .post(
    "/mover/estimates/:id/extra-charge",
    requireAuth,
    requireRole("MOVER"),
    requireProfile,
    validate(extraChargeProposeSchema),
    estimateController.proposeExtraCharge
  )
  /**
   * @swagger
   * /mover/estimates/{id}/extra-charge/{chargeId}:
   *   patch:
   *     tags: [Estimates]
   *     summary: 추가 금액 수정 (#140)
   *     description: |
   *       아직 고객이 응답하지 않은(`PROPOSED`) 본인 추가 금액 요청의 금액·사유를 고친다. mover 전용.
   *       잔금을 결제하기 전에만 가능하고, 상한은 이 건을 뺀 합계 기준으로 다시 검사한다. 고객에게 알림은 다시 가지 않는다.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *       - in: path
   *         name: chargeId
   *         required: true
   *         schema: { type: integer }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [amount, reason]
   *             properties:
   *               amount: { type: integer, minimum: 1000 }
   *               reason: { type: string, minLength: 1, maxLength: 200 }
   *     responses:
   *       200:
   *         description: 수정된 견적
   *       400:
   *         description: 응답 대기 건이 아님(EXTRA_CHARGE_NOT_PENDING) 또는 상한 초과(EXTRA_CHARGE_TOO_LARGE)
   *       403:
   *         description: 본인이 보낸 견적이 아님
   *       404:
   *         description: 견적 없음
   */
  // #140
  .patch(
    "/mover/estimates/:id/extra-charge/:chargeId",
    requireAuth,
    requireRole("MOVER"),
    requireProfile,
    validate(extraChargeProposeSchema),
    estimateController.updateExtraCharge
  )
  /**
   * @swagger
   * /mover/estimates/{id}/payment-request:
   *   post:
   *     tags: [Estimates]
   *     summary: 결제 요청 보내기 (#140)
   *     description: |
   *       본인이 보낸 이사 완료(COMPLETED) 견적이 아직 미결제(UNPAID)일 때, 고객에게 결제 요청 알림을 보낸다.
   *       mover 전용. **견적당 1번만** 보낼 수 있다(`paymentRequestedAt`이 비어 있을 때만).
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer }
   *     responses:
   *       200:
   *         description: 결제 요청 시각(`paymentRequestedAt`)이 기록된 견적
   *       400:
   *         description: 이사가 완료되지 않은 견적 (ESTIMATE_NOT_COMPLETED)
   *       403:
   *         description: 본인이 보낸 견적이 아님
   *       404:
   *         description: 견적 없음
   *       409:
   *         description: 이미 결제했거나(ALREADY_PAID) 이미 요청함(PAYMENT_REQUEST_ALREADY_SENT)
   */
  // #140 — "/mover/estimates/:id"(GET)와 메서드가 달라 충돌하지 않는다
  .post(
    "/mover/estimates/:id/payment-request",
    requireAuth,
    requireRole("MOVER"),
    requireProfile,
    estimateController.requestPayment
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
