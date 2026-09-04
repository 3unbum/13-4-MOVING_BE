import { Router } from "express";
import { optionalAuth, requireAuth } from "@/common/middlewares/auth";
import { requireRole } from "@/common/middlewares/role";
import { validate } from "@/common/middlewares/validate";
import { moverController } from "./mover.controller";
import { moverIdParamSchema, moverListQuerySchema, moverReviewsQuerySchema } from "./mover.schema";

const router = Router();

/**
 * @swagger
 * /movers:
 *   get:
 *     tags: [Movers]
 *     summary: 기사님 목록 조회
 *     description: |
 *       지역·서비스·키워드 필터와 정렬(리뷰수/평점/경력/확정건수)을 지원합니다.
 *       커서 기반 무한 스크롤입니다. 인증 없이 조회 가능합니다.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: 닉네임 검색 (부분 일치, 대소문자 무시)
 *       - in: query
 *         name: region
 *         schema: { type: string, example: 서울 }
 *         description: 한글 지역 라벨 (예 서울, 경기)
 *       - in: query
 *         name: service
 *         schema: { type: string, example: 소형이사 }
 *         description: 한글 서비스 라벨 (소형이사, 가정이사, 사무실이사)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [review, rating, career, confirmed]
 *           default: review
 *         description: 정렬 기준 (내림차순)
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: 이전 응답의 nextCursor 값
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 20, default: 10 }
 *         description: 페이지당 조회 개수
 *     responses:
 *       200:
 *         description: 기사님 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer, description: 기사님 userId }
 *                       nickName: { type: string }
 *                       image: { type: string, nullable: true }
 *                       career: { type: integer }
 *                       avgRating: { type: number }
 *                       reviewCount: { type: integer }
 *                       confirmedCount: { type: integer }
 *                       favoriteCount: { type: integer }
 *                       services: { type: array, items: { type: string } }
 *                       regions: { type: array, items: { type: string } }
 *                 nextCursor: { type: string, nullable: true }
 *                 hasNext: { type: boolean }
 *       400:
 *         description: 유효성 검사 실패 (잘못된 region/service/cursor 등)
 */
router.get("/", validate(moverListQuerySchema, "query"), moverController.list);

/**
 * @swagger
 * /movers/{id}/reviews:
 *   get:
 *     tags: [Movers]
 *     summary: 기사님 리뷰 목록 조회
 *     description: CONFIRMED 리뷰만 페이지네이션으로 조회합니다. 인증 없이 조회 가능합니다.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: 기사님 userId
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 5, default: 5 }
 *     responses:
 *       200:
 *         description: 리뷰 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       rating: { type: integer }
 *                       comment: { type: string }
 *                       createdAt: { type: string, format: date-time }
 *                       customerName: { type: string }
 *                 page: { type: integer }
 *                 totalPages: { type: integer }
 *                 totalCount: { type: integer }
 *       404:
 *         description: 기사님 없음
 */
router.get(
  "/:id/reviews",
  validate(moverIdParamSchema, "params"),
  validate(moverReviewsQuerySchema, "query"),
  moverController.listReviews
);

/**
 * @swagger
 * /movers/{id}/favorite:
 *   post:
 *     tags: [Movers]
 *     summary: 기사님 찜하기
 *     description: 로그인 일반 유저(CUSTOMER) 전용. favoriteCount가 증가한 카드 정보를 반환합니다.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: 기사님 userId
 *     responses:
 *       201:
 *         description: 찜 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     nickName: { type: string }
 *                     bio: { type: string }
 *                     image: { type: string, nullable: true }
 *                     avgRating: { type: number }
 *                     reviewCount: { type: integer }
 *                     confirmedCount: { type: integer }
 *                     favoriteCount: { type: integer }
 *                     services: { type: array, items: { type: string } }
 *                     regions: { type: array, items: { type: string } }
 *       400:
 *         description: 자기 자신 찜 시도 등
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: CUSTOMER 아님
 *       404:
 *         description: 기사님 없음
 *       409:
 *         description: 이미 찜함 (ALREADY_FAVORITED)
 */
router.post(
  "/:id/favorite",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(moverIdParamSchema, "params"),
  moverController.createFavorite
);

/**
 * @swagger
 * /movers/{id}/favorite:
 *   delete:
 *     tags: [Movers]
 *     summary: 기사님 찜 해제
 *     description: 로그인 일반 유저(CUSTOMER) 전용.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: 기사님 userId
 *     responses:
 *       200:
 *         description: 찜 해제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount: { type: integer }
 *                     deletedMoverIds:
 *                       type: array
 *                       items: { type: integer }
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: CUSTOMER 아님
 *       404:
 *         description: 찜한 기사님이 아님
 */
router.delete(
  "/:id/favorite",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(moverIdParamSchema, "params"),
  moverController.deleteFavorite
);

/**
 * @swagger
 * /movers/{id}:
 *   get:
 *     tags: [Movers]
 *     summary: 기사님 상세 조회
 *     description: |
 *       인증 없이 조회 가능합니다.
 *       로그인 CUSTOMER이면 isFavorited, isTargeted가 추가로 포함됩니다.
 *       (optionalAuth — 토큰이 없거나 잘못돼도 요청은 통과)
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: 기사님 userId
 *     responses:
 *       200:
 *         description: 기사님 상세
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     nickName: { type: string }
 *                     image: { type: string, nullable: true }
 *                     career: { type: integer }
 *                     bio: { type: string }
 *                     description: { type: string }
 *                     avgRating: { type: number }
 *                     reviewCount: { type: integer }
 *                     confirmedCount: { type: integer }
 *                     favoriteCount: { type: integer }
 *                     services: { type: array, items: { type: string } }
 *                     regions: { type: array, items: { type: string } }
 *                     isFavorited:
 *                       type: boolean
 *                       description: CUSTOMER 로그인 시에만 포함
 *                     isTargeted:
 *                       type: boolean
 *                       description: CUSTOMER + 활성 견적 요청 지정 여부 (로그인 시에만 포함)
 *       404:
 *         description: 기사님 없음
 */
router.get("/:id", validate(moverIdParamSchema, "params"), optionalAuth, moverController.getById);

export default router;
