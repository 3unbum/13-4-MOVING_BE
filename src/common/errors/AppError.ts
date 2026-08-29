import { ERROR_CODES, type ErrorCode } from "./errorCodes";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(code: ErrorCode, message: string) {
    return new AppError(400, code, message);
  }

  static unauthorized(message = "로그인이 필요합니다") {
    return new AppError(401, ERROR_CODES.UNAUTHORIZED, message);
  }

  static forbidden(message = "권한이 없습니다") {
    return new AppError(403, ERROR_CODES.FORBIDDEN, message);
  }

  static notFound(message = "대상을 찾을 수 없습니다") {
    return new AppError(404, ERROR_CODES.NOT_FOUND, message);
  }

  static conflict(code: ErrorCode, message: string) {
    return new AppError(409, code, message);
  }
}
