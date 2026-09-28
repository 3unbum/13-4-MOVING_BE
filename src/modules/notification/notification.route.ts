import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { validate } from "../../common/middlewares/validate";
import { notificationController } from "./notification.controller";
import {
  bulkDeleteNotificationsSchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from "./notification.schema";

const router = Router();

router.use(requireAuth);

/**
 * @swagger
 * /notifications/stream:
 *   get:
 *     tags: [Notifications]
 *     summary: 실시간 알림 SSE 연결
 *     description: |
 *       EventSource는 Authorization 헤더를 못 붙이므로 accessToken 쿠키로 인증합니다.
 *       `event: notification` 으로 새 알림 JSON을 받습니다.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: text/event-stream
 *       401:
 *         description: 인증 필요
 */
router.get("/stream", notificationController.stream);

/**
 * @swagger
 * /notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: 내 알림 전체 읽음
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: 읽음 처리된 건수
 */
router.patch("/read-all", notificationController.readAll);

/**
 * @swagger
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: 알림 목록
 *     description: |
 *       기본은 읽음·안읽음 전체입니다. 삭제한 알림은 DB에서 제거되어 나오지 않습니다.
 *       isRead=true|false 로 필터할 수 있습니다. 커서 페이지네이션입니다.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: isRead
 *         schema: { type: string, enum: [true, false] }
 *         description: 생략 시 전체. true=읽음만, false=안읽음만
 *       - in: query
 *         name: cursor
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 20, default: 10 }
 *     responses:
 *       200:
 *         description: 알림 목록
 *   delete:
 *     tags: [Notifications]
 *     summary: 알림 다중 삭제
 *     security:
 *       - cookieAuth: []
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
 *         description: 삭제된 알림 건수와 id 목록
 */
router.get("/", validate(listNotificationsQuerySchema, "query"), notificationController.list);
router.delete("/", validate(bulkDeleteNotificationsSchema), notificationController.bulkDelete);

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: 알림 단건 읽음
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 읽음 처리된 알림
 *       403:
 *         description: 본인 알림 아님
 *       404:
 *         description: 알림 없음
 */
router.patch(
  "/:id/read",
  validate(notificationIdParamSchema, "params"),
  notificationController.read
);

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     tags: [Notifications]
 *     summary: 알림 단건 삭제
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 삭제된 알림 건수와 id 목록
 *       403:
 *         description: 본인 알림 아님
 *       404:
 *         description: 알림 없음
 */
router.delete("/:id", validate(notificationIdParamSchema, "params"), notificationController.delete);

export default router;
