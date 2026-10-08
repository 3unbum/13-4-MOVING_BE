import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { requireRole } from "../../common/middlewares/role";
import { validate } from "../../common/middlewares/validate";
import { notificationController } from "./notification.controller";
import {
  bulkDeleteNotificationsSchema,
  notificationIdParamSchema,
  notificationListQuerySchema,
} from "./notification.schema";

const router = Router();

// 알림은 소비자·기사님이 모두 받으므로 role을 가르지 않습니다 (요약만 기사님 전용)
router.use(requireAuth);

/**
 * @swagger
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: 내 알림 목록 조회
 *     description: |
 *       최신순(`createdAt` 내림차순, 같으면 `id` 내림차순) 커서 페이지네이션. 문구는 저장하지 않으며 `type` + `payload`로 내려갑니다.
 *       payload는 type에 따라 달라집니다.
 *       - `NEW_REQUEST`: customerName, category, fromRegion, movingDate
 *       - `NEW_ESTIMATE`: moverNickName, category, price
 *       - `ESTIMATE_CONFIRMED`: moverNickName, customerName, category
 *       - `PAYMENT_REQUEST`: moverNickName, category, price (고객 수신, 기사님이 결제를 요청)
 *       - `PAYMENT_COMPLETED`: customerName, category, price (기사님 수신, 고객이 결제를 완료)
 *       - `DEPOSIT_PAID`: customerName, category, amount (기사님 수신, 고객이 선수금을 결제해 확정)
 *       - `DEPOSIT_EXPIRED`: moverNickName, customerName, category (고객·기사님 수신, 선수금 기한 만료로 확정 자동 취소)
 *       - `EXTRA_CHARGE_PROPOSED`: moverNickName, category, amount (고객 수신, 기사님이 추가 금액을 요청)
 *       - `EXTRA_CHARGE_RESPONDED`: customerName, category, amount, approved (기사님 수신, 고객이 승인·거절)
 *       - `MOVING_DAY_BEFORE` / `MOVING_DAY`: fromRegion, toRegion, fromAddress, toAddress, movingDate
 *       - `NEW_CHAT_MESSAGE`: roomId, senderName (받는 사람 기준 상대 이름. 메시지 내용은 싣지 않습니다)
 *
 *       `NEW_CHAT_MESSAGE`는 메시지마다 만들지 않고 **받는 사람 × 채팅방당 1건**입니다.
 *       새 메시지가 오면 같은 알림이 다시 안 읽음이 되고 목록 맨 위로 올라옵니다.
 *       채팅방에서 읽음 처리(`PATCH /chat-rooms/{id}/read`)하면 이 알림도 같이 읽음이 되고,
 *       채팅 알림은 닫힌 방(이사 완료 14일 경과)의 것도 목록과 `unreadCount`에 남습니다. 지난 대화는 볼 수 있어서입니다.
 *     parameters:
 *       - $ref: '#/components/parameters/cursor'
 *       - $ref: '#/components/parameters/take'
 *       - in: query
 *         name: isRead
 *         schema: { type: string, enum: ["true", "false"] }
 *         description: 생략하면 전체. true는 읽음만, false는 안 읽음만
 *     responses:
 *       200:
 *         description: 알림 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           type:
 *                             type: string
 *                             enum: [NEW_REQUEST, NEW_ESTIMATE, ESTIMATE_CONFIRMED, MOVING_DAY_BEFORE, MOVING_DAY, NEW_CHAT_MESSAGE, PAYMENT_REQUEST, PAYMENT_COMPLETED, DEPOSIT_PAID, DEPOSIT_EXPIRED, EXTRA_CHARGE_PROPOSED, EXTRA_CHARGE_RESPONDED]
 *                           payload: { type: object }
 *                           isRead: { type: boolean }
 *                           createdAt: { type: string, format: date-time }
 *                           estimateId: { type: integer, nullable: true }
 *                           quotationRequestId: { type: integer, nullable: true }
 *                           chatRoomId: { type: integer, nullable: true, description: "채팅 알림일 때만" }
 *                     nextCursor: { type: integer, nullable: true }
 *                     unreadCount: { type: integer }
 *       401:
 *         description: 미인증
 */
router.get("/", validate(notificationListQuerySchema, "query"), notificationController.list);

/**
 * @swagger
 * /notifications/stream:
 *   get:
 *     tags: [Notifications]
 *     summary: 알림 실시간 스트림 (SSE)
 *     description: |
 *       `text/event-stream`으로 연결을 열어두고, 새 알림이 생기면 `notification` 이벤트를 보냅니다.
 *       이벤트 본문은 `{ "type": "NEW_ESTIMATE" }`처럼 종류만 담으므로,
 *       받은 뒤 `GET /notifications`로 목록을 다시 받아가세요.
 *
 *       쿠키 인증이라 `new EventSource(url, { withCredentials: true })`로 연결합니다.
 *       accessToken이 만료되면 재연결에서 401이 나므로 `/auth/refresh` 후 다시 붙어야 합니다.
 *       25초마다 주석(`: ping`)을 보내 프록시가 유휴 연결을 끊지 않게 합니다.
 *     responses:
 *       200:
 *         description: 이벤트 스트림
 *         content:
 *           text/event-stream:
 *             schema: { type: string }
 *       401:
 *         description: 미인증
 */
router.get("/stream", notificationController.stream);

/**
 * @swagger
 * /notifications/summary:
 *   get:
 *     tags: [Notifications]
 *     summary: 오늘 견적 요청 요약 (기사님 전용)
 *     description: |
 *       한국 시간 오늘 만들어진 견적 요청 중, 기사님의 서비스 지역·이사유형에 맞는 건을 묶습니다.
 *       받은 요청 목록과 같은 대상이라 알림 읽음·삭제와 무관합니다.
 *       로그인 직후 "오늘 새 요청" 안내에 사용합니다.
 *     responses:
 *       200:
 *         description: 지역·유형별 오늘 건수
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           region: { type: string }
 *                           category: { type: string, enum: [SMALL, HOME, OFFICE] }
 *                           count: { type: integer }
 *                     totalCount: { type: integer }
 *       403:
 *         description: 기사님 전용
 */
router.get("/summary", requireRole("MOVER"), notificationController.summary);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: 알림 전체 읽음 처리
 *     responses:
 *       200:
 *         description: 읽음 처리된 건수
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     updatedCount: { type: integer }
 */
router.patch("/read-all", notificationController.readAll);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: 알림 단건 읽음 처리
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 읽음 처리 결과
 *       404:
 *         description: 본인 알림이 아니거나 없는 알림
 */
router.patch(
  "/:id/read",
  validate(notificationIdParamSchema, "params"),
  notificationController.read
);

/**
 * @swagger
 * /notifications:
 *   delete:
 *     tags: [Notifications]
 *     summary: 알림 다중 삭제
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: integer }
 *                 minItems: 1
 *                 maxItems: 50
 *     responses:
 *       200:
 *         description: 삭제된 건수와 실제로 지워진 id 목록
 *       400:
 *         description: ids 누락 또는 상한 초과
 */
router.delete("/", validate(bulkDeleteNotificationsSchema), notificationController.bulkRemove);

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     tags: [Notifications]
 *     summary: 알림 단건 삭제
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 삭제된 건수
 *       404:
 *         description: 본인 알림이 아니거나 없는 알림
 */
router.delete("/:id", validate(notificationIdParamSchema, "params"), notificationController.remove);

export default router;
