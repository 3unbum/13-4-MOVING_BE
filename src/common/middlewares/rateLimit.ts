import rateLimit from "express-rate-limit";
import { ERROR_CODES } from "../errors/errorCodes";

//retryAfterSeconds는 헤더의 Access-Control-Expose-Headers 추가 설정 없이 프론트가 바로 읽을 수 있도록 응답 바디에 포함합니다.

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: false,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.body.role}:${req.body.email}`,
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
