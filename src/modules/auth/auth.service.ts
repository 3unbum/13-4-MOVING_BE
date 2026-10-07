import { randomInt } from "node:crypto";
import { z } from "zod";
import { Prisma, type User } from "../../../generated/prisma/client";
import { mailer, MAIL_FROM } from "../../config/mailer";
import { authRepository } from "./auth.repository";
import {
  RESET_CODE_TTL_MINUTES,
  RESET_CODE_MAX_FAILED_ATTEMPTS,
  SIGNUP_CODE_TTL_MINUTES,
  SIGNUP_CODE_MAX_FAILED_ATTEMPTS,
  SIGNUP_VERIFIED_TTL_MINUTES,
} from "./auth.constants";
import hashUtil from "../../common/utils/hash.util";
import jwtUtil from "../../common/utils/jwt.util";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES, type ErrorCode } from "../../common/errors/errorCodes";
import { exchangeOAuthCode, toSocialProvider, type OAuthProviderName } from "./oauth/dispatcher";
import oauthSignupTokenUtil from "./oauth/oauthSignupToken.util";
import { buildResetCodeMail } from "./mail/resetCodeMail";
import { buildSignupCodeMail } from "./mail/signupCodeMail";
import passwordResetTokenUtil from "./password-reset/passwordResetToken.util";
import type {
  SignupDto,
  LoginDto,
  CheckEmailDto,
  FindEmailDto,
  SendSignupCodeDto,
  VerifySignupCodeDto,
  SendResetCodeDto,
  VerifyResetCodeDto,
  ResetPasswordDto,
  OAuthLoginDto,
  OAuthSignupDto,
} from "./auth.schema";
import type { AuthResult, FindEmailResult, OAuthLoginResult } from "./auth.type";

/** access/refresh 토큰을 발급하고, refreshToken 해시를 DB에 저장 */
const createAuthTokens = async (userId: User["id"], role: User["role"]) => {
  const accessToken = jwtUtil.createToken(userId, role, "access");
  const refreshToken = jwtUtil.createToken(userId, role, "refresh");
  await authRepository.updateRefreshToken(userId, hashUtil.hashRefreshToken(refreshToken));
  return { accessToken, refreshToken };
};

/** 비밀번호 재설정·회원가입 인증번호가 함께 쓰는 에러 — 용도별 에러 코드만 다르게 넘깁니다 */
const invalidCodeError = (code: ErrorCode) =>
  AppError.badRequest(code, "인증번호가 일치하지 않습니다");

const codeExpiredError = (code: ErrorCode) =>
  AppError.badRequest(code, "인증번호가 만료되었습니다. 인증번호를 다시 받아주세요");

const codeAttemptsExceededError = (code: ErrorCode) =>
  AppError.badRequest(
    code,
    "인증번호를 여러 번 틀려 무효가 되었습니다. 인증번호를 다시 받아주세요"
  );

const emailAlreadyExistsError = () =>
  AppError.conflict(ERROR_CODES.EMAIL_ALREADY_EXISTS, "이미 가입된 이메일입니다");

const generateResetCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  const visible = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, visible)}***@${domain}`;
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
  /** 이메일 인증(POST /auth/signup/verify) 후 SIGNUP_VERIFIED_TTL_MINUTES 안에만 가입할 수 있다 */
  async signup(dto: SignupDto): Promise<AuthResult> {
    const existing = await authRepository.findByEmailAndRole(dto.email, dto.role);
    if (existing) throw emailAlreadyExistsError();

    const hashedPassword = await hashUtil.hashPassword(dto.password);
    const verifiedSince = new Date(Date.now() - SIGNUP_VERIFIED_TTL_MINUTES * 60 * 1000);
    let user: User | null;
    try {
      user = await authRepository.createVerifiedLocalUser(
        {
          role: dto.role,
          name: dto.name,
          email: dto.email,
          phoneNumber: dto.phoneNumber,
          password: hashedPassword,
        },
        verifiedSince
      );
    } catch (error) {
      // 사전 조회 이후 동시 요청이 먼저 저장하면 user_role_email_local_key가 막고 P2002를 던짐
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw emailAlreadyExistsError();
      }
      throw error;
    }
    if (!user) {
      throw new AppError(
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED,
        "이메일 인증이 필요합니다. 인증번호를 다시 받아주세요"
      );
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

  async checkEmail(dto: CheckEmailDto): Promise<{ available: boolean }> {
    const existing = await authRepository.existsByEmailAndRole(dto.email, dto.role);
    return { available: !existing };
  },

  async findEmail(dto: FindEmailDto): Promise<FindEmailResult> {
    const users = await authRepository.findAccountsByNameAndPhone(
      dto.role,
      dto.name,
      dto.phoneNumber
    );
    return {
      accounts: users.map((user) => ({
        email: maskEmail(user.email),
        provider: user.provider ?? "LOCAL",
      })),
    };
  },

  /**
   * 가입 전 이메일로 인증번호를 보낸다. 실제로 메일을 보냈으면 true.
   * 비밀번호 재설정과 달리 가입 여부를 숨기지 않는다(/check-email·/signup이 이미 알려줌) —
   * 이미 가입된 이메일이면 409, 메일 발송 실패는 그대로 에러로 던진다.
   */
  async sendSignupCode(dto: SendSignupCodeDto): Promise<boolean> {
    const existing = await authRepository.existsByEmailAndRole(dto.email, dto.role);
    if (existing) throw emailAlreadyExistsError();

    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + SIGNUP_CODE_TTL_MINUTES * 60 * 1000);
    try {
      await authRepository.replaceSignupVerificationCode(
        dto.email,
        dto.role,
        hashUtil.hashResetCode(code),
        expiresAt
      );
    } catch (error) {
      // 같은 (email, role)의 동시 요청이 먼저 행을 만들면 유니크가 막음 — 먼저 온 요청이 메일을 보내므로 여기선 발송하지 않음
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }

    await mailer.sendMail({
      from: MAIL_FROM,
      to: dto.email,
      ...(await buildSignupCodeMail(code, SIGNUP_CODE_TTL_MINUTES)),
    });
    return true;
  },

  async verifySignupCode(dto: VerifySignupCodeDto): Promise<void> {
    const signupCode = await authRepository.findSignupVerificationCode(dto.email, dto.role);
    if (!signupCode) throw invalidCodeError(ERROR_CODES.INVALID_SIGNUP_CODE);

    if (signupCode.expiresAt <= new Date()) {
      throw codeExpiredError(ERROR_CODES.SIGNUP_CODE_EXPIRED);
    }
    if (signupCode.failedAttempts >= SIGNUP_CODE_MAX_FAILED_ATTEMPTS) {
      throw codeAttemptsExceededError(ERROR_CODES.SIGNUP_CODE_ATTEMPTS_EXCEEDED);
    }

    if (!hashUtil.compareResetCode(dto.code, signupCode.codeHash)) {
      const failedAttempts = await authRepository.incrementSignupCodeFailedAttempts(
        signupCode.id,
        SIGNUP_CODE_MAX_FAILED_ATTEMPTS
      );
      // null: 동시 요청이 먼저 상한을 채움 / 상한 도달: 이번이 마지막 기회였음 → 둘 다 이제 이 코드는 무효
      if (failedAttempts === null || failedAttempts >= SIGNUP_CODE_MAX_FAILED_ATTEMPTS) {
        throw codeAttemptsExceededError(ERROR_CODES.SIGNUP_CODE_ATTEMPTS_EXCEEDED);
      }
      throw invalidCodeError(ERROR_CODES.INVALID_SIGNUP_CODE);
    }

    // 확인하는 사이 재발송으로 행이 바뀌었으면 이 인증번호는 이미 무효
    const verified = await authRepository.markSignupCodeVerified(signupCode.id);
    if (!verified) throw invalidCodeError(ERROR_CODES.INVALID_SIGNUP_CODE);
  },

  async sendPasswordResetCode(dto: SendResetCodeDto): Promise<boolean> {
    const user = await authRepository.existsByEmailAndRole(dto.email, dto.role);
    if (!user) return false;

    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);
    try {
      await authRepository.replacePasswordResetCode(
        user.id,
        hashUtil.hashResetCode(code),
        expiresAt
      );
    } catch (error) {
      // 같은 유저의 동시 요청이 먼저 행을 만들면 userId 유니크가 막음 — 먼저 온 요청이 메일을 보내므로 여기선 발송하지 않음
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }

    try {
      await mailer.sendMail({
        from: MAIL_FROM,
        to: dto.email,
        ...(await buildResetCodeMail(code, RESET_CODE_TTL_MINUTES)),
      });
      return true;
    } catch (error) {
      // 발송 실패도 응답은 같게 줍니다 — 가입된 이메일일 때만 에러가 나면 가입 여부가 드러나므로
      console.error("[passwordReset] 인증번호 메일 발송 실패", error);
      return false;
    }
  },

  async verifyPasswordResetCode(dto: VerifyResetCodeDto): Promise<string> {
    // 미가입·코드 없음·사용된 코드도 실제 불일치와 같은 에러 — 가입 여부 숨김
    const user = await authRepository.existsByEmailAndRole(dto.email, dto.role);
    if (!user) throw invalidCodeError(ERROR_CODES.INVALID_RESET_CODE);

    const resetCode = await authRepository.findPasswordResetCodeByUserId(user.id);
    if (!resetCode || resetCode.usedAt) throw invalidCodeError(ERROR_CODES.INVALID_RESET_CODE);

    if (resetCode.expiresAt <= new Date()) {
      throw codeExpiredError(ERROR_CODES.RESET_CODE_EXPIRED);
    }
    if (resetCode.failedAttempts >= RESET_CODE_MAX_FAILED_ATTEMPTS) {
      throw codeAttemptsExceededError(ERROR_CODES.RESET_CODE_ATTEMPTS_EXCEEDED);
    }

    if (!hashUtil.compareResetCode(dto.code, resetCode.codeHash)) {
      const failedAttempts = await authRepository.incrementResetCodeFailedAttempts(
        resetCode.id,
        RESET_CODE_MAX_FAILED_ATTEMPTS
      );
      // null: 동시 요청이 먼저 상한을 채움 / 상한 도달: 이번이 마지막 기회였음 → 둘 다 이제 이 코드는 무효
      if (failedAttempts === null || failedAttempts >= RESET_CODE_MAX_FAILED_ATTEMPTS) {
        throw codeAttemptsExceededError(ERROR_CODES.RESET_CODE_ATTEMPTS_EXCEEDED);
      }
      throw invalidCodeError(ERROR_CODES.INVALID_RESET_CODE);
    }

    return passwordResetTokenUtil.create({ userId: user.id, codeId: resetCode.id });
  },

  async resetPassword(passwordResetToken: string, dto: ResetPasswordDto): Promise<void> {
    const invalidTokenError = new AppError(
      401,
      ERROR_CODES.INVALID_OR_EXPIRED_RESET_TOKEN,
      "인증 시간이 만료되었습니다. 인증번호를 다시 받아주세요"
    );

    let payload: { userId: number; codeId: number };
    try {
      payload = passwordResetTokenUtil.verify(passwordResetToken);
    } catch {
      throw invalidTokenError;
    }

    const hashedPassword = await hashUtil.hashPassword(dto.newPassword);
    const completed = await authRepository.completePasswordReset(
      payload.codeId,
      payload.userId,
      hashedPassword
    );
    if (!completed) throw invalidTokenError;
  },

  /**
   * code→token 교환·프로필 조회 후 (role, provider, providerId)로 기존 회원 여부를 판별한다.
   * 기존 회원이면 바로 로그인 처리, 신규 회원이면 oauthSignupToken만 발급하고
   * 계정 생성은 하지 않는다 (전화번호를 받아야 oauthSignup에서 생성됨).
   */
  async oauthLogin(provider: OAuthProviderName, dto: OAuthLoginDto): Promise<OAuthLoginResult> {
    const socialProvider = toSocialProvider(provider);
    const oauthProfile = await exchangeOAuthCode(provider, dto.code, dto.redirectUri);

    const existing = await authRepository.findBySocialAndRole(
      socialProvider,
      oauthProfile.providerId,
      dto.role
    );

    if (existing) {
      const { accessToken, refreshToken } = await createAuthTokens(existing.id, existing.role);
      return {
        isNewUser: false,
        accessToken,
        refreshToken,
        user: { id: existing.id, role: existing.role, name: existing.name, email: existing.email },
        hasProfile: !!(existing.customerProfile || existing.moverProfile),
      };
    }

    // 이메일 동의가 없는 계정을 그대로 만들면(email: "") 이후 이메일 기반 기능에서 식별이 안 됨 — 가입 자체를 막는다
    if (!z.email().safeParse(oauthProfile.email).success) {
      throw new AppError(
        400,
        ERROR_CODES.OAUTH_EMAIL_REQUIRED,
        "이메일이 없거나 유효하지 않습니다. provider 설정에서 이메일 제공에 동의한 뒤 다시 시도해주세요"
      );
    }

    const oauthSignupToken = oauthSignupTokenUtil.create({
      provider: socialProvider,
      providerId: oauthProfile.providerId,
      email: oauthProfile.email,
      name: oauthProfile.name,
      role: dto.role,
    });

    return {
      isNewUser: true,
      oauthSignupToken,
      providerProfile: {
        provider: socialProvider,
        email: oauthProfile.email,
        name: oauthProfile.name,
        profileImage: oauthProfile.profileImage,
      },
    };
  },

  /** oauthLogin에서 신규 회원으로 판별된 뒤, 전화번호를 받아 계정 생성을 완료한다. */
  async oauthSignup(oauthSignupToken: string, dto: OAuthSignupDto): Promise<AuthResult> {
    let payload;
    try {
      payload = oauthSignupTokenUtil.verify(oauthSignupToken);
    } catch {
      throw new AppError(
        401,
        ERROR_CODES.INVALID_OR_EXPIRED_SIGNUP_TOKEN,
        "인증 정보가 만료되었습니다. 처음부터 다시 시도해주세요"
      );
    }

    const existing = await authRepository.findBySocialAndRole(
      payload.provider,
      payload.providerId,
      payload.role
    );
    if (existing) {
      throw AppError.conflict(
        ERROR_CODES.PROVIDER_ACCOUNT_ALREADY_LINKED,
        "이미 가입된 계정입니다"
      );
    }

    let user: User;
    try {
      user = await authRepository.create({
        role: payload.role,
        name: payload.name,
        email: payload.email,
        phoneNumber: dto.phoneNumber,
        provider: payload.provider,
        providerId: payload.providerId,
      });
    } catch (error) {
      // findBySocialAndRole 조회 이후 동시 요청이 먼저 저장하면 (role, provider, providerId) 유니크가 막고 P2002를 던짐
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw AppError.conflict(
          ERROR_CODES.PROVIDER_ACCOUNT_ALREADY_LINKED,
          "이미 가입된 계정입니다"
        );
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
};
