import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../../config/env";

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
