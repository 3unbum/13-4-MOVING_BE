import type { User } from "../../../generated/prisma/client";
import { authRepository } from "./auth.repository";
import hashUtil from "../../common/utils/hash.util";
import jwtUtil from "../../common/utils/jwt.util";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import type { SignupDto, LoginDto } from "./auth.schema";
import type { AuthResult } from "./auth.type";

/** access/refresh 토큰을 발급하고, refreshToken 해시를 DB에 저장 */
const createAuthTokens = async (userId: User["id"], role: User["role"]) => {
  const accessToken = jwtUtil.createToken(userId, role, "access");
  const refreshToken = jwtUtil.createToken(userId, role, "refresh");
  await authRepository.updateRefreshToken(userId, hashUtil.hashRefreshToken(refreshToken));
  return { accessToken, refreshToken };
};

export const authService = {
  async signup(dto: SignupDto): Promise<AuthResult> {
    const existing = await authRepository.findByEmailAndRole(dto.email, dto.role);
    if (existing) {
      throw AppError.conflict(ERROR_CODES.EMAIL_ALREADY_EXISTS, "이미 가입된 이메일입니다");
    }

    const hashedPassword = await hashUtil.hashPassword(dto.password);
    const user = await authRepository.create({
      role: dto.role,
      name: dto.name,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      password: hashedPassword,
      provider: "LOCAL",
    });

    const { accessToken, refreshToken } = await createAuthTokens(user.id, user.role);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, role: user.role, name: user.name, email: user.email },
      hasProfile: false,
    };
  },

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await authRepository.findByEmailAndRole(dto.email, dto.role);
    if (!user || !user.password) {
      throw new AppError(
        401,
        ERROR_CODES.INVALID_CREDENTIALS,
        "이메일 또는 비밀번호가 일치하지 않습니다"
      );
    }

    const isValidPassword = await hashUtil.verifyPassword(dto.password, user.password);
    if (!isValidPassword) {
      throw new AppError(
        401,
        ERROR_CODES.INVALID_CREDENTIALS,
        "이메일 또는 비밀번호가 일치하지 않습니다"
      );
    }

    const { accessToken, refreshToken } = await createAuthTokens(user.id, user.role);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, role: user.role, name: user.name, email: user.email },
      hasProfile: !!(user.customerProfile || user.moverProfile),
    };
  },
};
