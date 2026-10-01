import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { ERROR_CODES } from "../errors/errorCodes";
import { isProduction } from "../../config/env";
import { Sentry } from "../../config/sentry";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `경로를 찾을 수 없습니다: ${req.method} ${req.originalUrl}`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  // 여기부터는 예상하지 못한 에러입니다.
  //
  // `AppError`(400·404 등 의도한 응답)는 위에서 이미 반환했으므로 Sentry로 가지 않습니다.
  // 전부 보내면 "비밀번호가 틀렸습니다" 같은 정상 동작까지 알림이 쌓여
  // 무료 플랜 할당량(월 5,000건)만 소진됩니다.
  //
  // DSN이 없으면 `initSentry`가 아무것도 하지 않으므로 이 호출은 조용히 무시됩니다.
  Sentry.captureException(error);

  // 프로덕션에서는 내부 정보를 노출하지 않습니다
  console.error(error);
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "서버 오류가 발생했습니다",
      ...(isProduction ? {} : { detail: error.message, stack: error.stack }),
    },
  });
};
