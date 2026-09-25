import rateLimit from "express-rate-limit";
import { ERROR_CODES } from "../errors/errorCodes";

/**
 * 로그인 무차별 대입 방지. IP가 아닌 이메일(req.body.email) 기준으로 15분에 5회 제한합니다.
 * 반드시 body 유효성 검사(validate(loginSchema)) 뒤에 걸어야 email이 문자열임이 보장됩니다.
 * retryAfterSeconds는 헤더의 Access-Control-Expose-Headers 추가 설정 없이 프론트가 바로 읽을 수 있도록 응답 바디에 포함합니다.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => req.body.email,
  handler: (req, res) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime
      ? Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : 0;

    res.status(429).json({
      error: {
        code: ERROR_CODES.TOO_MANY_REQUESTS,
        message: "로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요",
        retryAfterSeconds,
      },
    });
  },
});
