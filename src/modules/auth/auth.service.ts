import { Prisma, type User } from "../../../generated/prisma/client";
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

/**
 * refreshToken 서명 검증 → userId로 유저 조회 → DB에 저장된 해시와 대조.
 * logout/refresh가 공유하는 절차라 하나로 묶음. 통과하면 그 유저를 반환.
 */
const verifyRefreshTokenOwner = async (
  refreshToken: string,
  options?: { ignoreExpiration?: boolean }
) => {
  let userId: User["id"];
  try {
    userId = jwtUtil.verifyToken(refreshToken, "refresh", options).userId;
  } catch (error) {
    const isExpired = error instanceof Error && error.name === "TokenExpiredError";
    throw new AppError(
      401,
      isExpired ? ERROR_CODES.REFRESH_TOKEN_EXPIRED : ERROR_CODES.REFRESH_TOKEN_INVALID,
      isExpired ? "토큰이 만료되었습니다" : "유효하지 않은 토큰입니다"
    );
  }

  const user = await authRepository.findById(userId);
  if (!user?.refreshToken || !hashUtil.compareRefreshToken(refreshToken, user.refreshToken)) {
    throw new AppError(
      401,
      ERROR_CODES.REFRESH_TOKEN_INVALID,
      "이미 로그아웃되었거나 유효하지 않은 토큰입니다"
    );
  }

  return user;
};

export const authService = {
  async signup(dto: SignupDto): Promise<AuthResult> {
    const existing = await authRepository.findByEmailAndRole(dto.email, dto.role);
    if (existing) {
      throw AppError.conflict(ERROR_CODES.EMAIL_ALREADY_EXISTS, "이미 가입된 이메일입니다");
    }

    const hashedPassword = await hashUtil.hashPassword(dto.password);
    let user: User;
    try {
      user = await authRepository.create({
        role: dto.role,
        name: dto.name,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        password: hashedPassword,
        provider: "LOCAL",
      });
    } catch (error) {
      // 사전 조회 이후 동시 요청이 먼저 저장하면 user_role_email_local_key가 막고 P2002를 던짐
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw AppError.conflict(ERROR_CODES.EMAIL_ALREADY_EXISTS, "이미 가입된 이메일입니다");
      }
      throw error;
    }

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

  /**
   * refreshToken 자체가 이미 만료됐어도 로그아웃(DB 정리)은 허용하기 위해 exp 검증을 무시함.
   * accessToken 만료는 애초에 무관 — logout 라우트엔 requireAuth가 안 붙어 있어서 accessToken을 아예 안 봄.
   */
  async logout(refreshToken: string): Promise<void> {
    const user = await verifyRefreshTokenOwner(refreshToken, { ignoreExpiration: true });
    await authRepository.updateRefreshToken(user.id, null);
  },

  /** rotation 없음 — access token만 새로 발급 */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const user = await verifyRefreshTokenOwner(refreshToken);
    const accessToken = jwtUtil.createToken(user.id, user.role, "access");
    return { accessToken };
  },
};
