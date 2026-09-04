import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../../config/env";

/**
 * OAuth 신규가입 2단계(전화번호 입력 전) 동안 provider 프로필을 담아두는 임시 토큰.
 * LOCAL은 여기 올 일이 없으므로 GOOGLE/KAKAO/NAVER로 제한합니다.
 */
const payloadSchema = z.object({
  provider: z.enum(["GOOGLE", "KAKAO", "NAVER"]),
  providerId: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(["CUSTOMER", "MOVER"]),
});

export type OAuthSignupTokenPayload = z.infer<typeof payloadSchema>;

const create = (payload: OAuthSignupTokenPayload): string =>
  jwt.sign(payload, env.OAUTH_SIGNUP_TOKEN_SECRET, {
    expiresIn: env.OAUTH_SIGNUP_TOKEN_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

const verify = (token: string): OAuthSignupTokenPayload => {
  const decoded = jwt.verify(token, env.OAUTH_SIGNUP_TOKEN_SECRET, { algorithms: ["HS256"] });
  return payloadSchema.parse(decoded);
};

export default { create, verify };
