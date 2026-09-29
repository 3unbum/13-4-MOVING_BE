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
 *       최신순 커서 페이지네이션. 문구는 저장하지 않으며 `type` + `payload`로 내려갑니다.
 *       payload는 type에 따라 달라집니다.
 *       - `NEW_REQUEST`: category, fromRegion, movingDate
 *       - `NEW_ESTIMATE`: moverNickName, category, price
 *       - `ESTIMATE_CONFIRMED`: moverNickName, customerName, category
 *       - `MOVING_DAY_BEFORE` / `MOVING_DAY`: fromAddress, toAddress, movingDate
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
 *                             enum: [NEW_REQUEST, NEW_ESTIMATE, ESTIMATE_CONFIRMED, MOVING_DAY_BEFORE, MOVING_DAY]
 *                           payload: { type: object }
 *                           isRead: { type: boolean }
 *                           createdAt: { type: string, format: date-time }
 *                           estimateId: { type: integer, nullable: true }
 *                           quotationRequestId: { type: integer, nullable: true }
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
 *     summary: 미확인 견적 요청 요약 (기사님 전용)
 *     description: |
 *       읽지 않은 `NEW_REQUEST`를 출발지 지역·이사유형으로 묶어 건수를 돌려줍니다.
 *       로그인 직후 "내가 선택한 지역의 소형이사 견적이 N건" 안내에 사용합니다.
 *     responses:
 *       200:
 *         description: 지역·유형별 미확인 건수
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
