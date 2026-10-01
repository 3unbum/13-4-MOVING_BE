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

  // `AppError`가 아니어도 클라이언트 잘못인 에러가 있습니다.
  //
  // `express.json()`은 깨진 JSON에 `SyntaxError`(status 400), 본문이 한도를 넘으면
  // `PayloadTooLargeError`(status 413)를 던집니다. 둘 다 `AppError`가 아니라서
  // 그냥 두면 **500으로 응답되고 Sentry로도 전송**됩니다.
  // 누가 깨진 JSON을 반복해서 보내면 이 경로로 무료 할당량이 소진됩니다.
  const status = (error as { status?: number }).status;
  const isClientError = typeof status === "number" && status >= 400 && status < 500;

  if (isClientError) {
    res.status(status).json({
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "요청 형식이 올바르지 않습니다",
      },
    });
    return;
  }

  // 여기부터가 진짜 예상하지 못한 에러입니다.
  //
  // 의도한 응답(`AppError`)과 클라이언트 잘못(4xx)은 위에서 이미 반환했으므로
  // Sentry로 가지 않습니다. 전부 보내면 "비밀번호가 틀렸습니다" 같은 정상 동작까지
  // 알림이 쌓여 무료 플랜 할당량(월 5,000건)만 소진됩니다.
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
