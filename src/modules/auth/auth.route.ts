import { Router } from "express";
import { validate } from "../../common/middlewares/validate";
import { signupSchema, loginSchema, checkEmailSchema } from "./auth.schema";
import { authController } from "./auth.controller";

const router = Router();

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: 회원가입
 *     description: 이메일/비밀번호 기반 회원가입. 성공 시 accessToken/refreshToken을 httpOnly 쿠키로 내려줌.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, name, email, phoneNumber, password]
 *             properties:
 *               role: { type: string, enum: [CUSTOMER, MOVER] }
 *               name: { type: string, minLength: 1 }
 *               email: { type: string, format: email }
 *               phoneNumber: { type: string, description: "01[016789]XXXXXXX(X) 형식" }
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: 영문 + 숫자 + 특수문자 포함, 72바이트 이하
 *     responses:
 *       201:
 *         description: 회원가입 성공 — user 정보와 hasProfile(false) 반환
 *       400:
 *         description: 유효성 검사 실패
 *       409:
 *         description: 이미 가입된 이메일 (EMAIL_ALREADY_EXISTS)
 */
router.post("/signup", validate(signupSchema), authController.signup);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: 로그인
 *     description: role/email/password로 로그인. 성공 시 accessToken/refreshToken을 httpOnly 쿠키로 내려줌.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, email, password]
 *             properties:
 *               role: { type: string, enum: [CUSTOMER, MOVER] }
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: 로그인 성공 — user 정보와 hasProfile 반환
 *       400:
 *         description: 유효성 검사 실패
 *       401:
 *         description: 이메일 또는 비밀번호 불일치 (INVALID_CREDENTIALS)
 */
router.post("/login", validate(loginSchema), authController.login);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: 로그아웃
 *     description: refreshToken 쿠키를 검증해 DB에 저장된 refreshToken 해시를 지우고 accessToken/refreshToken 쿠키를 모두 clear. access token 만료 여부와 무관하게 로그아웃 가능.
 *     security:
 *       - refreshTokenAuth: []
 *     responses:
 *       204:
 *         description: 로그아웃 성공
 *       401:
 *         description: refreshToken 쿠키가 없거나 유효하지 않음 (REFRESH_TOKEN_INVALID)
 */
router.post("/logout", authController.logout);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: 토큰 갱신
 *     description: refreshToken 쿠키를 검증해 accessToken만 재발급(rotation 없음).
 *     security:
 *       - refreshTokenAuth: []
 *     responses:
 *       204:
 *         description: 갱신 성공 — accessToken 쿠키 재발급
 *       401:
 *         description: refreshToken이 없거나 만료(REFRESH_TOKEN_EXPIRED) / 유효하지 않음(REFRESH_TOKEN_INVALID)
 */
router.post("/refresh", authController.refresh);

router.post("/check-email", validate(checkEmailSchema), authController.checkEmail);

export default router;
