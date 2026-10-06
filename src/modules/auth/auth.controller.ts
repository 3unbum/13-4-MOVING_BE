import type { Request, RequestHandler } from "express";
import { authService } from "./auth.service";
import { profileService } from "../profile/profile.service";
import {
  setAuthCookies,
  setAccessTokenCookie,
  clearAuthCookies,
  setOAuthSignupTokenCookie,
  clearOAuthSignupTokenCookie,
  setPasswordResetTokenCookie,
  clearPasswordResetTokenCookie,
  REFRESH_TOKEN_COOKIE,
  OAUTH_SIGNUP_TOKEN_COOKIE,
  PASSWORD_RESET_TOKEN_COOKIE,
} from "../../common/utils/cookie.util";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { refundResetCodeMailCount } from "../../common/middlewares/rateLimit";
import type { OAuthProviderName } from "./oauth/dispatcher";

const getRefreshTokenOrThrow = (req: Request): string => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!refreshToken) {
    throw new AppError(401, ERROR_CODES.REFRESH_TOKEN_INVALID, "인증 토큰이 없습니다");
  }
  return refreshToken;
};

const getOAuthSignupTokenOrThrow = (req: Request): string => {
  const oauthSignupToken = req.cookies?.[OAUTH_SIGNUP_TOKEN_COOKIE];
  if (!oauthSignupToken) {
    throw new AppError(
      401,
      ERROR_CODES.INVALID_OR_EXPIRED_SIGNUP_TOKEN,
      "인증 정보가 만료되었습니다. 처음부터 다시 시도해주세요"
    );
  }
  return oauthSignupToken;
};

const getPasswordResetTokenOrThrow = (req: Request): string => {
  const passwordResetToken = req.cookies?.[PASSWORD_RESET_TOKEN_COOKIE];
  if (!passwordResetToken) {
    throw new AppError(
      401,
      ERROR_CODES.INVALID_OR_EXPIRED_RESET_TOKEN,
      "인증 시간이 만료되었습니다. 인증번호를 다시 받아주세요"
    );
  }
  return passwordResetToken;
};

export const authController = {
  signup: (async (req, res, next) => {
    try {
      const { accessToken, refreshToken, user, hasProfile } = await authService.signup(req.body);
      setAuthCookies(res, { accessToken, refreshToken });
      res.status(201).json({ data: { user, hasProfile } });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  login: (async (req, res, next) => {
    try {
      const { accessToken, refreshToken, user, hasProfile } = await authService.login(req.body);
      setAuthCookies(res, { accessToken, refreshToken });
      res.json({ data: { user, hasProfile } });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  logout: (async (req, res, next) => {
    try {
      await authService.logout(getRefreshTokenOrThrow(req));
      clearAuthCookies(res);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  refresh: (async (req, res, next) => {
    try {
      const { accessToken } = await authService.refresh(getRefreshTokenOrThrow(req));
      setAccessTokenCookie(res, accessToken);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  checkEmail: (async (req, res, next) => {
    try {
      const result = await authService.checkEmail(req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  findEmail: (async (req, res, next) => {
    try {
      const result = await authService.findEmail(req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /** 발송 전에 먼저 응답 — 기다리면 가입된 계정만 늦게 응답해 응답 시간으로 가입 여부가 드러남 */
  sendPasswordResetCode: (async (req, res) => {
    res.status(204).send();

    let sent = false;
    try {
      sent = await authService.sendPasswordResetCode(req.body);
    } catch (error) {
      console.error("[passwordReset] 인증번호 발송 처리 실패", error);
    } finally {
      if (!sent) await refundResetCodeMailCount();
    }
  }) as RequestHandler,

  verifyPasswordResetCode: (async (req, res, next) => {
    try {
      const passwordResetToken = await authService.verifyPasswordResetCode(req.body);
      setPasswordResetTokenCookie(res, passwordResetToken);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  resetPassword: (async (req, res, next) => {
    try {
      await authService.resetPassword(getPasswordResetTokenOrThrow(req), req.body);
      clearPasswordResetTokenCookie(res);
      clearAuthCookies(res);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /**
   * role을 모른 채 부를 수 있는 유일한 계정 조회.
   * requireAuth가 채워준 req.user.role로 분기만 하고, 응답 본문은 GET /profiles/{role}과 동일합니다.
   */
  me: (async (req, res, next) => {
    try {
      const { id, role } = req.user!;
      const result =
        role === "MOVER"
          ? await profileService.getMoverAccount(id)
          : await profileService.getCustomerAccount(id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  deleteAccount: (async (req, res, next) => {
    try {
      await authService.deleteAccount(req.user!.id, req.body);
      clearAuthCookies(res);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  oauthLogin: (async (req, res, next) => {
    try {
      const provider = req.params.provider as OAuthProviderName;
      const result = await authService.oauthLogin(provider, req.body);

      if (result.isNewUser) {
        setOAuthSignupTokenCookie(res, result.oauthSignupToken);
        res.json({
          data: {
            isNewUser: true,
            providerProfile: result.providerProfile,
          },
        });
        return;
      }

      setAuthCookies(res, { accessToken: result.accessToken, refreshToken: result.refreshToken });
      res.json({ data: { isNewUser: false, user: result.user, hasProfile: result.hasProfile } });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  oauthSignup: (async (req, res, next) => {
    try {
      const oauthSignupToken = getOAuthSignupTokenOrThrow(req);
      const { accessToken, refreshToken, user, hasProfile } = await authService.oauthSignup(
        oauthSignupToken,
        req.body
      );
      clearOAuthSignupTokenCookie(res);
      setAuthCookies(res, { accessToken, refreshToken });
      res.status(201).json({ data: { user, hasProfile } });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
