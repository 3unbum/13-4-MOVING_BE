import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { validate } from "../../common/middlewares/validate";
import {
  loginRateLimiter,
  resetCodeRateLimiters,
  resetCodeDailyMailLimiter,
} from "../../common/middlewares/rateLimit";
import {
  signupSchema,
  loginSchema,
  checkEmailSchema,
  findEmailSchema,
  sendResetCodeSchema,
  verifyResetCodeSchema,
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
 *       429:
 *         description: 동일 계정(role + 이메일)으로 15분간 로그인 5회 초과 실패 (TOO_MANY_REQUESTS)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: object
 *                   properties:
 *                     code: { type: string, example: TOO_MANY_REQUESTS }
 *                     message: { type: string }
 *                     retryAfterSeconds: { type: integer }
 */
router.post("/login", validate(loginSchema), loginRateLimiter, authController.login);

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
 * /auth/find-email:
 *   post:
 *     tags: [Auth]
 *     summary: 아이디(이메일) 찾기
 *     description: |
 *       role + 이름 + 전화번호가 일치하는 계정의 이메일을 마스킹해서 돌려줍니다(예: ab***@naver.com).
 *       이메일 가입(LOCAL) 계정뿐 아니라 소셜 계정도 포함하며, provider로 가입 경로를 알려줍니다 —
 *       소셜로 가입한 걸 잊은 사용자가 이메일로 중복 가입하지 않도록 하기 위함입니다.
 *       같은 role 안에서도 LOCAL과 소셜 계정이 함께 있을 수 있어 여러 건이 나올 수 있습니다.
 *       일치하는 계정이 없으면 404가 아니라 빈 배열로 응답합니다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, name, phoneNumber]
 *             properties:
 *               role: { type: string, enum: [CUSTOMER, MOVER] }
 *               name: { type: string, minLength: 1, description: "앞뒤 공백은 제거 후 비교" }
 *               phoneNumber: { type: string, description: "01[016789]XXXXXXX(X) 형식" }
 *     responses:
 *       200:
 *         description: 조회 완료 — 일치하는 계정이 없으면 accounts가 빈 배열
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     accounts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           email: { type: string, example: "ab***@naver.com" }
 *                           provider: { type: string, enum: [LOCAL, GOOGLE, KAKAO, NAVER] }
 *             example:
 *               data:
 *                 accounts:
 *                   - { email: "ab***@naver.com", provider: LOCAL }
 *                   - { email: "ab***@naver.com", provider: KAKAO }
 *       400:
 *         description: 유효성 검사 실패
 */
router.post("/find-email", validate(findEmailSchema), authController.findEmail);

/**
 * @swagger
 * /auth/password-reset/code:
 *   post:
 *     tags: [Auth]
 *     summary: 비밀번호 재설정 인증번호 발송
 *     description: |
 *       (role, email)의 이메일 가입(LOCAL) 계정이 있으면 6자리 인증번호를 메일로 보냅니다(유효 5분).
 *       재발송하면 이전 인증번호는 무효가 됩니다.
 *       가입 여부가 드러나지 않도록 미가입 이메일·소셜 계정·발송 실패 모두 같은 204로 응답합니다.
 *       안내 문구는 프론트에서 표시합니다.
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
 *       204:
 *         description: 요청 처리 완료 (실제 발송 여부와 무관)
 *       400:
 *         description: 유효성 검사 실패
 *       429:
 *         description: |
 *           요청 횟수 초과 (TOO_MANY_REQUESTS). 가입 여부와 무관하게 모든 요청을 셉니다.
 *           - 같은 계정(role + 이메일): 1분 1회 / 1시간 5회 / 하루 10회
 *           - 서비스 전체: 하루 400통 (실제로 발송한 메일만 셈)
 *           retryAfterSeconds로 재발송 버튼 카운트다운을 표시할 수 있습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: object
 *                   properties:
 *                     code: { type: string, example: TOO_MANY_REQUESTS }
 *                     message: { type: string }
 *                     retryAfterSeconds: { type: integer }
 */
router.post(
  "/password-reset/code",
  validate(sendResetCodeSchema),
  ...resetCodeRateLimiters,
  resetCodeDailyMailLimiter,
  authController.sendPasswordResetCode
);

/**
 * @swagger
 * /auth/password-reset/verify:
 *   post:
 *     tags: [Auth]
 *     summary: 비밀번호 재설정 인증번호 확인
 *     description: |
 *       메일로 받은 6자리 인증번호가 맞으면 재설정 토큰(10분 유효)을 httpOnly 쿠키(passwordResetToken)로 발급합니다.
 *       응답 바디에는 토큰이 없습니다. 이 쿠키로 POST /auth/password-reset을 호출해 새 비밀번호를 설정합니다.
 *       인증번호 하나에 5번까지 틀릴 수 있고, 5번째로 틀리면 그 인증번호는 무효가 되어 다시 받아야 합니다.
 *       코드 추측은 이 횟수 제한과 발송 limiter가 막으므로 이 엔드포인트에는 limiter를 두지 않습니다.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, email, code]
 *             properties:
 *               role: { type: string, enum: [CUSTOMER, MOVER] }
 *               email: { type: string, format: email, description: "인증번호를 요청할 때 입력한 이메일" }
 *               code: { type: string, pattern: "^\\d{6}$", example: "482913" }
 *     responses:
 *       204:
 *         description: 인증 성공 — passwordResetToken 쿠키 발급
 *       400:
 *         description: |
 *           - VALIDATION_ERROR: 요청 형식 오류
 *           - INVALID_RESET_CODE: 인증번호 불일치 (미가입 이메일·발송 이력 없음도 같은 코드로 응답)
 *           - RESET_CODE_EXPIRED: 발송 후 5분 경과 → 다시 받아야 함
 *           - RESET_CODE_ATTEMPTS_EXCEEDED: 5번 틀려 무효 → 다시 받아야 함
 */
router.post(
  "/password-reset/verify",
  validate(verifyResetCodeSchema),
  authController.verifyPasswordResetCode
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: 내 계정 정보 조회 (role 무관)
 *     description: |
 *       accessToken 쿠키만으로 호출할 수 있는, role을 미리 몰라도 되는 유일한 계정 조회 엔드포인트입니다.
 *       서버가 토큰에 담긴 role을 보고 CUSTOMER/MOVER 응답 중 알맞은 쪽을 골라 내려주므로,
 *       GNB처럼 어느 페이지에서든 마운트되는 전역 로그인 상태 확인에 사용합니다.
 *       응답 본문은 GET /profiles/customer · GET /profiles/mover와 완전히 동일합니다.
 *       가입 직후 계정 정보를 봐야 해서 requireProfile은 걸지 않습니다 — hasProfile이 false여도 200입니다.
 *       requireRole도 걸지 않으므로 403은 발생하지 않습니다(프론트는 401만 비로그인으로 해석하면 됩니다).
 *     responses:
 *       200:
 *         description: role 필드로 판별하는 계정+프로필 정보
 *         content:
 *           application/json:
 *             examples:
 *               customer:
 *                 summary: role이 CUSTOMER인 경우
 *                 value:
 *                   data:
 *                     userId: 1
 *                     role: CUSTOMER
 *                     name: 김고객
 *                     email: customer1@test.com
 *                     phoneNumber: "01012345678"
 *                     hasProfile: true
 *                     image: null
 *                     region: SEOUL
 *                     services: [HOME, OFFICE]
 *               mover:
 *                 summary: role이 MOVER인 경우
 *                 value:
 *                   data:
 *                     userId: 2
 *                     role: MOVER
 *                     name: 이기사
 *                     email: mover1@test.com
 *                     phoneNumber: "01087654321"
 *                     hasProfile: true
 *                     image: null
 *                     nickName: 믿음이사
 *                     career: 7
 *                     bio: 꼼꼼한 이사를 도와드립니다.
 *                     description: 안녕하세요...
 *                     avgRating: 4.8
 *                     services: [HOME]
 *                     regions: [SEOUL, GYEONGGI]
 *       401:
 *         description: accessToken 쿠키가 없거나 위조됨(ACCESS_TOKEN_INVALID) / 만료됨(ACCESS_TOKEN_EXPIRED)
 *       404:
 *         description: 토큰의 유저가 더 이상 존재하지 않음 (NOT_FOUND)
 */
router.get("/me", requireAuth, authController.me);

/**
 * @swagger
 * /auth/oauth/signup:
 *   post:
 *     tags: [Auth]
 *     summary: OAuth 회원가입 완료
 *     description: |
 *       소셜 로그인 콜백에서 신규 회원으로 판별된(isNewUser true) 뒤, 그때 발급된 oauthSignupToken 쿠키와 전화번호로 계정 생성을 완료한다.
 *       role은 토큰에 이미 담겨 있어 따로 받지 않는다. oauthSignupToken은 요청 바디가 아닌 httpOnly 쿠키로 전달되며,
 *       가입 성공 시 재사용 방지를 위해 쿠키를 clear한다.
 *     security:
 *       - oauthSignupTokenAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phoneNumber]
 *             properties:
 *               phoneNumber: { type: string, description: "01[016789]XXXXXXX(X) 형식" }
 *     responses:
 *       201:
 *         description: 회원가입 성공 — user 정보와 hasProfile(false) 반환, accessToken/refreshToken 쿠키 발급, oauthSignupToken 쿠키 clear
 *       400:
 *         description: 유효성 검사 실패
 *       401:
 *         description: oauthSignupToken 쿠키가 없거나 만료·위조됨 (INVALID_OR_EXPIRED_SIGNUP_TOKEN)
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
 *       기존 회원이면 accessToken/refreshToken을 httpOnly 쿠키로 내려주며 바로 로그인 처리하고,
 *       신규 회원이면 계정을 만들지 않고 oauthSignupToken을 httpOnly 쿠키로만 발급한다(응답 바디에는 포함되지 않음).
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
 *         description: 기존 회원(isNewUser false) 또는 신규 회원(isNewUser true, oauthSignupToken 쿠키 발급) 응답
 *       400:
 *         description: 유효성 검사 실패, 또는 신규 회원인데 provider가 준 이메일이 없거나 유효하지 않음 (OAUTH_EMAIL_REQUIRED)
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
