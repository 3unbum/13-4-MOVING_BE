import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { ERROR_CODES } from "../errors/errorCodes";
import { isProduction } from "../../config/env";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `경로를 찾을 수 없습니다: ${req.method} ${req.originalUrl}`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // jsonwebtoken 토큰 검증 실패 (expressjwt 등 사용 시)
  if (error.name === "UnauthorizedError") {
    res.status(401).json({
      error: { code: ERROR_CODES.INVALID_TOKEN, message: "유효하지 않은 토큰입니다" },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  // 예상하지 못한 에러: 프로덕션에서는 내부 정보를 노출하지 않습니다
  console.error(error);
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "서버 오류가 발생했습니다",
      ...(isProduction ? {} : { detail: error.message, stack: error.stack }),
    },
  });
};
