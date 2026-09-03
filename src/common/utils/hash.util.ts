import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { AppError } from "../errors/AppError";
import { ERROR_CODES } from "../errors/errorCodes";

/** bcrypt는 UTF-8 기준 처음 72바이트만 사용합니다. 초과분은 조용히 잘려서 서로 다른 비밀번호가 같은 해시가 될 수 있다. */
const BCRYPT_MAX_BYTES = 72;

const assertValidPasswordLength = (password: string) => {
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES) {
    throw AppError.badRequest(
      ERROR_CODES.VALIDATION_ERROR,
      `비밀번호는 ${BCRYPT_MAX_BYTES}바이트를 초과할 수 없습니다`
    );
  }
};

const hashPassword = async (password: string) => {
  assertValidPasswordLength(password);
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  return hashedPassword;
};

const verifyPassword = async (password: string, hashedPassword: string) => {
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES) {
    return false;
  }
  return await bcrypt.compare(password, hashedPassword);
};

/**
 * refresh token(JWT) 해싱 전용. hashPassword는 재사용 못 함 —
 * hashPassword 안의 72바이트 길이 체크(assertValidPasswordLength)는 "비밀번호냐 아니냐"를
 * 안 가리고 그냥 들어오는 문자열 길이만 보기 때문에, 이보다 훨씬 긴 JWT를 넣으면 그대로 걸려서 에러남.
 * (bcrypt 자체가 에러를 던지는 게 아니라, 우리가 비밀번호용으로 추가한 이 길이 체크가 원인)
 */
const hashRefreshToken = (token: string) => createHash("sha256").update(token).digest("hex");

const compareRefreshToken = (token: string, hashedToken: string) =>
  hashRefreshToken(token) === hashedToken;

export default { hashPassword, verifyPassword, hashRefreshToken, compareRefreshToken };
