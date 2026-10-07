import rateLimit, { MemoryStore, type Options } from "express-rate-limit";
import type { Request } from "express";
import { ERROR_CODES } from "../errors/errorCodes";

//retryAfterSeconds는 헤더의 Access-Control-Expose-Headers 추가 설정 없이 프론트가 바로 읽을 수 있도록 응답 바디에 포함합니다.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const tooManyRequestsHandler =
  (message: string): Options["handler"] =>
  (req, res) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : 0;

    res.status(429).json({
      error: {
        code: ERROR_CODES.TOO_MANY_REQUESTS,
        message,
        retryAfterSeconds,
      },
    });
  };

const accountKey = (req: Request) => `${req.body.role}:${req.body.email}`;

export const loginRateLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 5,
  standardHeaders: false,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: accountKey,
  handler: tooManyRequestsHandler("로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요"),
});

/** 인증번호 발송 계정(role + 이메일) 기준 제한. 용도마다 따로 만들어 카운트를 섞지 않습니다 */
const codeAccountLimiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: accountKey,
    handler: tooManyRequestsHandler(message),
  });

const CODE_LIMIT_MESSAGE = "인증번호 요청 횟수를 초과했습니다. 잠시 후 다시 시도해주세요";

const createCodeRateLimiters = () => [
  codeAccountLimiter(MINUTE, 1, "인증번호는 1분에 한 번만 요청할 수 있습니다"),
  codeAccountLimiter(HOUR, 5, CODE_LIMIT_MESSAGE),
  codeAccountLimiter(DAY, 10, CODE_LIMIT_MESSAGE),
];

export const resetCodeRateLimiters = createCodeRateLimiters();

export const signupCodeRateLimiters = createCodeRateLimiters();

const DAILY_MAIL_KEY = "verification-mail";
const dailyMailStore = new MemoryStore();

/**
 * 서비스 전체 인증번호 메일 일일 상한(메일 서버 한도 보호). 비밀번호 재설정·회원가입 인증이 함께 씁니다.
 * 요청 시 미리 세고, 컨트롤러가 발송 결과로 환불. skipFailedRequests는 연결 종료 시 무조건 환불해 우회 가능하므로 쓰지 않음
 */
export const dailyMailLimiter = rateLimit({
  windowMs: DAY,
  limit: 400,
  standardHeaders: false,
  legacyHeaders: false,
  store: dailyMailStore,
  keyGenerator: () => DAILY_MAIL_KEY,
  handler: tooManyRequestsHandler(
    "일시적으로 인증번호를 보낼 수 없습니다. 잠시 후 다시 시도해주세요"
  ),
});

export const refundDailyMailCount = () => dailyMailStore.decrement(DAILY_MAIL_KEY);

/** 채팅 도배 방지 — 유저당 분당 30건. requireAuth 뒤에 둬서 req.user.id로 셉니다 */
export const chatMessageRateLimiter = rateLimit({
  windowMs: MINUTE,
  limit: 30,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req: Request) => String(req.user?.id),
  handler: tooManyRequestsHandler(
    "메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해주세요"
  ),
});
