import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../../config/env";

/**
 * 인증번호 확인 성공 후 새 비밀번호 설정까지 쓰는 임시 토큰.
 * 토큰만으로는 1회 사용을 막을 수 없으므로, 사용 여부는 codeId가 가리키는
 * PasswordResetCode.usedAt으로 DB에서 판단합니다.
 */
const payloadSchema = z.object({
  userId: z.number().int(),
  codeId: z.number().int(),
});

export type PasswordResetTokenPayload = z.infer<typeof payloadSchema>;

const create = (payload: PasswordResetTokenPayload): string =>
  jwt.sign(payload, env.PASSWORD_RESET_TOKEN_SECRET, {
    expiresIn: env.PASSWORD_RESET_TOKEN_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

const verify = (token: string): PasswordResetTokenPayload => {
  const decoded = jwt.verify(token, env.PASSWORD_RESET_TOKEN_SECRET, { algorithms: ["HS256"] });
  return payloadSchema.parse(decoded);
};

export default { create, verify };
