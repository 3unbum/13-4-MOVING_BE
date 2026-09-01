import { User } from "../../../generated/prisma/client";
import { UserRole, SocialProvider } from "../../../generated/prisma/enums";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env";

const tokenPayloadSchema = z.object({
  userId: z.number(),
  role: z.enum(UserRole),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

const oauthSignupPayloadSchema = z.object({
  provider: z.enum(SocialProvider),
  role: z.enum(UserRole),
});

export type OAuthSignupTokenPayload = z.infer<typeof oauthSignupPayloadSchema>;

const createToken = (userId: User["id"], role: User["role"], type: "access" | "refresh") => {
  const payload: TokenPayload = {
    userId,
    role,
  };
  const expiresIn = type === "access" ? env.JWT_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN;
  const secret = type === "access" ? env.JWT_SECRET : env.JWT_REFRESH_SECRET;

  const token = jwt.sign(payload, secret, { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] });
  return token;
};

const verifyToken = (
  token: string,
  type: "access" | "refresh",
  options?: { ignoreExpiration?: boolean }
): TokenPayload => {
  const secret = type === "access" ? env.JWT_SECRET : env.JWT_REFRESH_SECRET;
  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    ignoreExpiration: options?.ignoreExpiration,
  });

  return tokenPayloadSchema.parse(decoded);
};

const createOAuthSignupToken = (payload: OAuthSignupTokenPayload): string => {
  const token = jwt.sign(payload, env.OAUTH_SIGNUP_TOKEN_SECRET, {
    expiresIn: env.OAUTH_SIGNUP_TOKEN_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
  return token;
};

const verifyOAuthSignupToken = (
  token: string,
  options?: { ignoreExpiration?: boolean }
): OAuthSignupTokenPayload => {
  const decoded = jwt.verify(token, env.OAUTH_SIGNUP_TOKEN_SECRET, {
    algorithms: ["HS256"],
    ignoreExpiration: options?.ignoreExpiration,
  });

  return oauthSignupPayloadSchema.parse(decoded);
};

export default {
  createToken,
  verifyToken,
  createOAuthSignupToken,
  verifyOAuthSignupToken,
};
