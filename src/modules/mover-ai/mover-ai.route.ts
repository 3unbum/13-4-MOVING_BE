import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { moverAiMessageRateLimiter } from "../../common/middlewares/rateLimit";
import { requireRole } from "../../common/middlewares/role";
import { validate } from "../../common/middlewares/validate";
import { moverAiController } from "./mover-ai.controller";
import { postMessageSchema, sessionIdParamSchema } from "./mover-ai.schema";

const router = Router();

router.use(requireAuth, requireRole("CUSTOMER"));

/**
 * @swagger
 * components:
 *   schemas:
 *     MoverAiFilters:
 *       type: object
 *       required: [region, service, sort]
 *       properties:
 *         region:
 *           type: string
 *           nullable: true
 *           enum: [SEOUL, GYEONGGI, INCHEON, GANGWON, CHUNGBUK, CHUNGNAM, SEJONG, DAEJEON, JEONBUK, JEONNAM, GWANGJU, GYEONGBUK, GYEONGNAM, DAEGU, ULSAN, BUSAN, JEJU]
 *           description: 도착지. 아직 모르면 null
 *         service:
 *           type: string
 *           nullable: true
 *           enum: [SMALL, HOME, OFFICE]
 *           description: 이사 유형. 아직 모르면 null
 *         sort:
 *           type: string
 *           nullable: true
 *           enum: [rating, review, career, confirmed]
 *           description: 정렬. 아직 모르면 null
 *     MoverAiChip:
 *       type: object
 *       required: [id, label, action, value]
 *       properties:
 *         id: { type: string, example: service_home }
 *         label: { type: string, example: 가정이사 }
 *         action:
 *           type: string
 *           enum: [SELECT_SERVICE, SELECT_SORT, SELECT_REGION, SHOW_MORE, CHANGE_FILTERS, FAVORITE_ALL]
 *         value: { type: string, nullable: true, example: HOME }
 *     MoverAiMoverCard:
 *       type: object
 *       description: 기사님 목록 카드와 같은 형태
 *       properties:
 *         id: { type: integer, description: 기사님 userId }
 *         nickName: { type: string }
 *         image: { type: string, nullable: true }
 *         career: { type: integer }
 *         bio: { type: string }
 *         description: { type: string }
 *         avgRating: { type: number }
 *         reviewCount: { type: integer }
 *         confirmedCount: { type: integer }
 *         favoriteCount: { type: integer }
 *         services: { type: array, items: { type: string } }
 *         regions: { type: array, items: { type: string } }
 *     MoverAiUi:
 *       type: object
 *       required: [nextAction, chips, movers, listMeta]
 *       properties:
 *         nextAction:
 *           type: string
 *           enum: [ASK_REGION, ASK_SERVICE, ASK_SORT, SHOW_MOVERS, CLARIFY_UNSUPPORTED, CLARIFY_REGION]
 *           description: |
 *             다음에 받을 입력. 칩은 이 값으로 서버가 만듭니다.
 *             ASK_REGION은 칩이 없고, CLARIFY_REGION은 겹치는 지명 후보 칩입니다.
 *         chips:
 *           type: array
 *           nullable: true
 *           items: { $ref: "#/components/schemas/MoverAiChip" }
 *         movers:
 *           type: array
 *           nullable: true
 *           description: SHOW_MOVERS일 때만 최대 3명. 찜 완료 메시지에는 null
 *           items: { $ref: "#/components/schemas/MoverAiMoverCard" }
 *         listMeta:
 *           type: object
 *           nullable: true
 *           properties:
 *             nextCursor: { type: string, nullable: true }
 *             hasNext: { type: boolean }
 *     MoverAiMessage:
 *       type: object
 *       required: [id, role, content]
 *       properties:
 *         id: { type: string, description: cuid }
 *         role: { type: string, enum: [USER, ASSISTANT, SYSTEM] }
 *         content: { type: string }
 *         ui:
 *           allOf:
 *             - $ref: "#/components/schemas/MoverAiUi"
 *           description: ASSISTANT 메시지에만 있습니다
 */

/**
 * @swagger
 * /mover-ai/sessions:
 *   post:
 *     tags: [MoverAI]
 *     summary: 기사님 AI 찾기 세션 생성
 *     description: |
 *       일반 유저 전용. 빈 세션과 환영 메시지를 만들고 Gemini는 호출하지 않습니다.
 *       환영 메시지의 nextAction은 ASK_REGION이고 chips는 null입니다.
 *     responses:
 *       201:
 *         description: 세션 생성
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId: { type: string, description: cuid }
 *                     messages:
 *                       type: array
 *                       items: { $ref: "#/components/schemas/MoverAiMessage" }
 *       401:
 *         description: 미인증 (UNAUTHORIZED)
 *       403:
 *         description: 일반 유저가 아님 (FORBIDDEN)
 */
router.post("/sessions", moverAiController.createSession);

/**
 * @swagger
 * /mover-ai/sessions/{sessionId}:
 *   get:
 *     tags: [MoverAI]
 *     summary: AI 찾기 세션·대화 복원
 *     description: |
 *       본인 세션의 메시지와 현재 슬롯을 반환합니다.
 *       추천했던 기사 카드는 moverIds로 다시 조회해 붙입니다. 찜 완료 메시지에는 카드를 붙이지 않습니다.
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 세션 복원
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId: { type: string }
 *                     filters: { $ref: "#/components/schemas/MoverAiFilters" }
 *                     messages:
 *                       type: array
 *                       items: { $ref: "#/components/schemas/MoverAiMessage" }
 *       401:
 *         description: 미인증 (UNAUTHORIZED)
 *       403:
 *         description: 일반 유저가 아님 (FORBIDDEN)
 *       404:
 *         description: 세션 없음 (NOT_FOUND)
 */
router.get(
  "/sessions/:sessionId",
  validate(sessionIdParamSchema, "params"),
  moverAiController.getSession
);

/**
 * @swagger
 * /mover-ai/sessions/{sessionId}/messages:
 *   post:
 *     tags: [MoverAI]
 *     summary: AI 찾기 메시지 전송
 *     description: |
 *       유저당 분당 10건. 칩 클릭은 clientAction으로 보내고, 그때는 Gemini를 호출하지 않습니다.
 *       clientAction이 없으면 문장을 읽어 슬롯을 채웁니다. 규칙으로 읽지 못한 문장만 Gemini에 맡깁니다.
 *       지역·유형·정렬이 모두 채워지면 기사님 3명을 반환합니다.
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 description: 사용자에게 보여줄 말. 칩을 눌러도 비우지 않습니다
 *               clientAction:
 *                 nullable: true
 *                 description: 생략하거나 null이면 자유 입력. 칩 클릭이면 아래 중 하나
 *                 oneOf:
 *                   - type: object
 *                     required: [type, value]
 *                     properties:
 *                       type: { type: string, enum: [SELECT_SERVICE] }
 *                       value: { type: string, enum: [SMALL, HOME, OFFICE] }
 *                   - type: object
 *                     required: [type, value]
 *                     properties:
 *                       type: { type: string, enum: [SELECT_SORT] }
 *                       value: { type: string, enum: [rating, review, career, confirmed] }
 *                   - type: object
 *                     required: [type, value]
 *                     properties:
 *                       type: { type: string, enum: [SELECT_REGION] }
 *                       value:
 *                         type: string
 *                         enum: [SEOUL, GYEONGGI, INCHEON, GANGWON, CHUNGBUK, CHUNGNAM, SEJONG, DAEJEON, JEONBUK, JEONNAM, GWANGJU, GYEONGBUK, GYEONGNAM, DAEGU, ULSAN, BUSAN, JEJU]
 *                   - type: object
 *                     required: [type]
 *                     properties:
 *                       type: { type: string, enum: [SHOW_MORE] }
 *                       value: { type: string, nullable: true }
 *                   - type: object
 *                     required: [type]
 *                     properties:
 *                       type: { type: string, enum: [CHANGE_FILTERS] }
 *                       value: { type: string, nullable: true }
 *                   - type: object
 *                     required: [type]
 *                     properties:
 *                       type: { type: string, enum: [FAVORITE_ALL] }
 *                       value: { type: string, nullable: true }
 *           examples:
 *             freeText:
 *               summary: 자유 입력
 *               value:
 *                 message: 용인으로 가정이사 평점 높은 순
 *                 clientAction: null
 *             chip:
 *               summary: 유형 칩
 *               value:
 *                 message: 가정이사
 *                 clientAction: { type: SELECT_SERVICE, value: HOME }
 *     responses:
 *       200:
 *         description: 어시스턴트 응답
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId: { type: string }
 *                     assistantMessage: { $ref: "#/components/schemas/MoverAiMessage" }
 *                     filters: { $ref: "#/components/schemas/MoverAiFilters" }
 *                     favoriteResult:
 *                       type: object
 *                       description: FAVORITE_ALL일 때만
 *                       properties:
 *                         favoritedCount: { type: integer }
 *                         skippedCount: { type: integer }
 *       400:
 *         description: |
 *           유효성 검사 실패, 또는 조건이 덜 찼는데 더 보기·모두 찜하기를 누른 경우 (VALIDATION_ERROR)
 *       401:
 *         description: 미인증 (UNAUTHORIZED)
 *       403:
 *         description: 일반 유저가 아님 (FORBIDDEN)
 *       404:
 *         description: 세션 없음 (NOT_FOUND)
 *       429:
 *         description: 유저당 분당 10건 초과 (TOO_MANY_REQUESTS)
 */
router.post(
  "/sessions/:sessionId/messages",
  moverAiMessageRateLimiter,
  validate(sessionIdParamSchema, "params"),
  validate(postMessageSchema),
  moverAiController.postMessage
);

export default router;
