import { User } from "../../../generated/prisma/client";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";

export interface TokenPayload {
  userId: User["id"];
  role: User["role"];
}

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

const verifyToken = (token: string, type: "access" | "refresh") => {
  const secret = type === "access" ? env.JWT_SECRET : env.JWT_REFRESH_SECRET;
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });

  return decoded as TokenPayload;
};

export default {
  createToken,
  verifyToken,
};
