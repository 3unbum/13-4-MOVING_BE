import rateLimit, { MemoryStore, type Options } from "express-rate-limit";
import type { Request } from "express";
import { ERROR_CODES } from "../errors/errorCodes";

//retryAfterSeconds는 헤더의 Access-Control-Expose-Headers 추가 설정 없이 프론트가 바로 읽을 수 있도록 응답 바디에 포함합니다.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** limiter마다 문구만 다르고 429 응답 형식은 같게 맞춥니다. */
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

/** 계정은 (role, email)로 구분되므로 같은 이메일이라도 role이 다르면 따로 셉니다. */
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

/**
 * 비밀번호 재설정 인증번호 발송 — 계정 기준. 메일 폭탄 방지가 목적입니다.
 * 가입 여부를 숨기려고 항상 같은 응답을 주므로 성공/실패 구분 없이 모든 요청을 셉니다.
 */
const resetCodeAccountLimiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: accountKey,
    handler: tooManyRequestsHandler(message),
  });

const RESET_CODE_LIMIT_MESSAGE = "인증번호 요청 횟수를 초과했습니다. 잠시 후 다시 시도해주세요";

/**
 * 1분 간격은 보안보다 UX 목적 — 메일이 늦게 와서 재발송하면 이전 코드가 무효가 되는데,
 * 먼저 도착한 메일의 코드를 입력하면 불일치가 떠서 사용자가 이유를 알 수 없습니다.
 * 앞의 limiter에서 막힌 요청은 뒤로 가지 않으므로 연타해도 시간·일 한도는 줄지 않습니다.
 */
export const resetCodeRateLimiters = [
  resetCodeAccountLimiter(MINUTE, 1, "인증번호는 1분에 한 번만 요청할 수 있습니다"),
  resetCodeAccountLimiter(HOUR, 5, RESET_CODE_LIMIT_MESSAGE),
  resetCodeAccountLimiter(DAY, 10, RESET_CODE_LIMIT_MESSAGE),
];

const RESET_CODE_MAIL_KEY = "password-reset-mail";
const resetCodeMailStore = new MemoryStore();

/**
 * 비밀번호 재설정 인증번호 발송 — 서비스 전체 일일 상한. Gmail 하루 약 500통 한도 소진 방지.
 * 미가입 이메일에는 메일을 보내지 않으므로, 모든 요청을 세면 아무 이메일로 400번 요청하는 것만으로
 * 상한이 소진됩니다. 그래서 요청이 들어올 때 한 통을 미리 세고, 컨트롤러가 발송 결과를 보고
 * 보내지 않았을 때만 refundResetCodeMailCount로 되돌립니다.
 * skipFailedRequests를 쓰지 않는 이유: 응답 전에 연결이 끊기면 발송 여부와 관계없이 카운트를
 * 되돌리는데, 메일은 연결과 무관하게 계속 발송되므로 요청 후 바로 끊는 것만으로 상한을 우회할 수 있습니다.
 */
export const resetCodeDailyMailLimiter = rateLimit({
  windowMs: DAY,
  limit: 400,
  standardHeaders: false,
  legacyHeaders: false,
  store: resetCodeMailStore,
  keyGenerator: () => RESET_CODE_MAIL_KEY,
  handler: tooManyRequestsHandler(
    "일시적으로 인증번호를 보낼 수 없습니다. 잠시 후 다시 시도해주세요"
  ),
});

/** 메일을 보내지 않은 요청(미가입 이메일·발송 실패·에러)이 미리 센 한 통을 되돌립니다. */
export const refundResetCodeMailCount = () => resetCodeMailStore.decrement(RESET_CODE_MAIL_KEY);
