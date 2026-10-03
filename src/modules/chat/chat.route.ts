import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { validate } from "../../common/middlewares/validate";
import { chatMessageRateLimiter } from "../../common/middlewares/rateLimit";
import { chatController } from "./chat.controller";
import { uploadChatImageFile } from "./chat.upload";
import {
  chatMessageListQuerySchema,
  chatRoomIdParamSchema,
  chatRoomListQuerySchema,
  sendChatMessageSchema,
} from "./chat.schema";

const router = Router();

// 채팅은 확정된 견적의 고객·기사님만 쓰므로 role을 가르지 않고, 방 소속은 서비스에서 가립니다
router.use(requireAuth);

/**
 * @swagger
 * /chat-rooms:
 *   get:
 *     tags: [Chat]
 *     summary: 내 채팅방 목록 조회
 *     description: |
 *       최근 대화순(lastMessageAt desc) 커서 페이지네이션.
 *       상대방 프로필, 마지막 메시지, 안 읽은 메시지 수를 한 번에 내려줍니다.
 *       상대방은 고객이면 기사님(닉네임), 기사님이면 고객(이름)입니다.
 *       이사 완료일(KST) 00시부터 14일이 지난 방은 `isClosed: true`로 내려갑니다. 목록에 남고 지난 대화는 볼 수 있지만,
 *       메시지·사진 전송은 403 `CHAT_ROOM_CLOSED`입니다.
 *     parameters:
 *       - $ref: '#/components/parameters/cursor'
 *       - $ref: '#/components/parameters/take'
 *     responses:
 *       200:
 *         description: 채팅방 목록
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
 *                           estimateId: { type: integer }
 *                           counterpart:
 *                             type: object
 *                             properties:
 *                               id: { type: integer }
 *                               name: { type: string }
 *                               image: { type: string, nullable: true }
 *                           lastMessage:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id: { type: integer }
 *                               content: { type: string }
 *                               imageUrl: { type: string, nullable: true }
 *                               senderId: { type: integer }
 *                               createdAt: { type: string, format: date-time }
 *                           lastMessageAt: { type: string, format: date-time }
 *                           unreadCount: { type: integer }
 *                           isClosed: { type: boolean, description: "이사 완료 후 14일이 지나 전송할 수 없는 방" }
 *                     nextCursor: { type: integer, nullable: true }
 *       401:
 *         description: 미인증
 */
router.get("/", validate(chatRoomListQuerySchema, "query"), chatController.listRooms);

/**
 * @swagger
 * /chat-rooms/{id}/messages:
 *   get:
 *     tags: [Chat]
 *     summary: 채팅 메시지 조회
 *     description: |
 *       **최신순**(id desc) 커서 페이지네이션입니다. 위로 스크롤할 때 `nextCursor`로 이전 메시지를 받고,
 *       화면에 그릴 때는 배열을 뒤집으세요 (default 30, max 50).
 *       `counterpartLastReadId` 이하 id의 내 메시지는 "읽음"으로 표시합니다.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - $ref: '#/components/parameters/cursor'
 *       - in: query
 *         name: take
 *         schema: { type: integer, minimum: 1, maximum: 50 }
 *     responses:
 *       200:
 *         description: 메시지 목록
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
 *                           roomId: { type: integer }
 *                           senderId: { type: integer }
 *                           content: { type: string }
 *                           imageUrl: { type: string, nullable: true }
 *                           createdAt: { type: string, format: date-time }
 *                     nextCursor: { type: integer, nullable: true }
 *                     counterpartLastReadId: { type: integer, nullable: true }
 *                     isClosed: { type: boolean }
 *       404:
 *         description: 내 채팅방이 아니거나 없는 방
 */
router.get(
  "/:id/messages",
  validate(chatRoomIdParamSchema, "params"),
  validate(chatMessageListQuerySchema, "query"),
  chatController.listMessages
);

/**
 * @swagger
 * /chat-rooms/{id}/messages:
 *   post:
 *     tags: [Chat]
 *     summary: 채팅 메시지 전송
 *     description: |
 *       유저당 분당 30건으로 제한합니다 (초과 시 429).
 *       전송 후 양쪽에 SSE `chat` 이벤트(`{ type: "MESSAGE", roomId, messageId }`)가 갑니다.
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
 *             required: [content]
 *             properties:
 *               content: { type: string, minLength: 1, maxLength: 1000 }
 *     responses:
 *       201:
 *         description: 저장된 메시지
 *       400:
 *         description: 내용이 비었거나 1000자 초과
 *       403:
 *         description: 이사 완료 후 14일이 지나 닫힌 방 (code CHAT_ROOM_CLOSED)
 *       404:
 *         description: 내 채팅방이 아니거나 없는 방
 *       429:
 *         description: 전송 횟수 초과
 */
router.post(
  "/:id/messages",
  validate(chatRoomIdParamSchema, "params"),
  chatMessageRateLimiter,
  validate(sendChatMessageSchema),
  chatController.sendMessage
);

/**
 * @swagger
 * /chat-rooms/{id}/images:
 *   post:
 *     tags: [Chat]
 *     summary: 채팅 사진 전송
 *     description: |
 *       사진 한 장을 올리고 사진 메시지로 저장합니다. 텍스트와 함께 보낼 수 없고, 사진만 한 건의 메시지가 됩니다.
 *       jpeg·png·webp, 최대 5MB. 실제 바이트로 형식을 다시 검증합니다.
 *       메시지 전송과 같은 분당 30건 제한을 공유합니다.
 *       저장된 메시지는 `content`가 빈 문자열이고 `imageUrl`에 CDN URL이 들어갑니다.
 *       URL을 아는 사람은 누구나 볼 수 있습니다(프로필 이미지와 같은 방식).
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
 *               image: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: 저장된 메시지 (imageUrl 포함)
 *       400:
 *         description: 파일 없음, 형식 오류, 5MB 초과
 *       403:
 *         description: 이사 완료 후 14일이 지나 닫힌 방 (code CHAT_ROOM_CLOSED)
 *       404:
 *         description: 내 채팅방이 아니거나 없는 방
 *       429:
 *         description: 전송 횟수 초과
 */
router.post(
  "/:id/images",
  validate(chatRoomIdParamSchema, "params"),
  chatMessageRateLimiter,
  uploadChatImageFile,
  chatController.sendImage
);

/**
 * @swagger
 * /chat-rooms/{id}/read:
 *   patch:
 *     tags: [Chat]
 *     summary: 채팅방 읽음 처리
 *     description: |
 *       방의 마지막 메시지까지 읽은 것으로 처리합니다. 이미 그 이상 읽었으면 변하지 않습니다.
 *       실제로 바뀌면 상대에게 SSE `chat` 이벤트(`{ type: "READ", roomId }`)가 갑니다.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 내가 읽은 마지막 메시지 id (메시지가 없으면 null)
 *       404:
 *         description: 내 채팅방이 아니거나 없는 방
 */
router.patch("/:id/read", validate(chatRoomIdParamSchema, "params"), chatController.markRead);

export default router;
