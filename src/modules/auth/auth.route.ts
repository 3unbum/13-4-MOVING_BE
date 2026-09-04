import { Router } from "express";
import { validate } from "../../common/middlewares/validate";
import {
  signupSchema,
  loginSchema,
  checkEmailSchema,
  oauthProviderParamSchema,
  oauthLoginSchema,
  oauthSignupSchema,
} from "./auth.schema";
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

/**
 * @swagger
 * /auth/check-email:
 *   post:
 *     tags: [Auth]
 *     summary: 이메일 중복 확인
 *     description: (email, role) 조합의 LOCAL(일반) 가입 여부를 확인합니다. 소셜 로그인 계정은 별도 계정으로 취급되어 이 확인에 포함되지 않습니다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, email]
 *             properties:
 *               role: { type: string, enum: [CUSTOMER, MOVER] }
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: 확인 완료 — available이 false면 해당 (email, role) 조합으로 이미 가입됨
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     available: { type: boolean }
 *       400:
 *         description: 유효성 검사 실패
 */
router.post("/check-email", validate(checkEmailSchema), authController.checkEmail);

/**
 * @swagger
 * /auth/oauth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: OAuth 회원가입 완료
 *     description: 소셜 로그인 콜백에서 신규 회원으로 판별된(isNewUser true) 뒤 발급받은 oauthSignupToken과 전화번호로 계정 생성을 완료한다. role은 토큰에 이미 담겨 있어 따로 받지 않는다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oauthSignupToken, phoneNumber]
 *             properties:
 *               oauthSignupToken: { type: string }
 *               phoneNumber: { type: string, description: "01[016789]XXXXXXX(X) 형식" }
 *     responses:
 *       201:
 *         description: 회원가입 성공 — user 정보와 hasProfile(false) 반환
 *       400:
 *         description: 유효성 검사 실패
 *       401:
 *         description: oauthSignupToken이 만료되었거나 유효하지 않음 (INVALID_OR_EXPIRED_SIGNUP_TOKEN)
 *       409:
 *         description: 이미 가입된 (provider, providerId, role) 조합 (PROVIDER_ACCOUNT_ALREADY_LINKED)
 */
// "/oauth/:provider"보다 반드시 먼저 등록해야 함 — 아니면 이 요청이 provider="signup"으로 매칭되어 버림
router.post("/oauth/signup", validate(oauthSignupSchema), authController.oauthSignup);

/**
 * @swagger
 * /auth/oauth/{provider}:
 *   post:
 *     tags: [Auth]
 *     summary: 소셜 로그인 진입/콜백
 *     description: |
 *       프론트가 provider 인가 URL로 브라우저를 직접 리다이렉트하고, provider가 프론트 콜백 페이지로 돌려준 code를 이 엔드포인트에 전달한다.
 *       기존 회원이면 accessToken/refreshToken을 httpOnly 쿠키로 내려주며 바로 로그인 처리하고, 신규 회원이면 계정을 만들지 않고 oauthSignupToken만 발급한다.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema: { type: string, enum: [google, kakao, naver] }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, redirectUri, role]
 *             properties:
 *               code: { type: string }
 *               redirectUri: { type: string, description: "provider 콘솔에 등록한 프론트 콜백 주소" }
 *               role: { type: string, enum: [CUSTOMER, MOVER] }
 *     responses:
 *       200:
 *         description: 기존 회원(isNewUser false) 또는 신규 회원(isNewUser true, oauthSignupToken 발급) 응답
 *       400:
 *         description: 유효성 검사 실패, 또는 신규 회원인데 provider가 이메일을 제공하지 않음 (OAUTH_EMAIL_REQUIRED)
 *       401:
 *         description: provider 인가 코드가 유효하지 않음 (INVALID_OAUTH_CODE)
 *       502:
 *         description: provider 응답 처리 실패 (OAUTH_PROVIDER_ERROR)
 */
router.post(
  "/oauth/:provider",
  validate(oauthProviderParamSchema, "params"),
  validate(oauthLoginSchema),
  authController.oauthLogin
);

export default router;
