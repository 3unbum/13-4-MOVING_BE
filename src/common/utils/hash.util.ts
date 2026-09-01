import bcrypt from "bcrypt";
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
  assertValidPasswordLength(password);
  return await bcrypt.compare(password, hashedPassword);
};

export default { hashPassword, verifyPassword };
