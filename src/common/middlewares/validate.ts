import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors/AppError";
import { ERROR_CODES } from "../errors/errorCodes";

type Target = "body" | "query" | "params";

/**
 * zod 스키마로 요청을 검증합니다.
 * 각 모듈의 *.schema.ts에 스키마를 정의하고 route에서 사용하세요.
 */
export function validate(schema: ZodType, target: Target = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      next(AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, message));
      return;
    }

    req[target] = result.data as never;
    next();
  };
}
