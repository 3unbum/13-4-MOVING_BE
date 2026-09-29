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
  REFRESH_TOKEN_COOKIE,
  OAUTH_SIGNUP_TOKEN_COOKIE,
} from "../../common/utils/cookie.util";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
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

  /**
   * 가입 여부가 드러나지 않도록 발송 여부와 관계없이 항상 204로 응답합니다.
   * mailSent는 응답 전에 표시해야 합니다 — 일일 발송 상한 limiter가 응답이 끝난 뒤 이 값을 읽어
   * 실제로 보낸 메일만 카운트에 남깁니다.
   */
  sendPasswordResetCode: (async (req, res, next) => {
    try {
      const sent = await authService.sendPasswordResetCode(req.body);
      if (sent) res.locals.mailSent = true;
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /** 인증번호가 맞으면 재설정 토큰을 httpOnly 쿠키로만 내려줍니다(응답 바디에는 없음). */
  verifyPasswordResetCode: (async (req, res, next) => {
    try {
      const passwordResetToken = await authService.verifyPasswordResetCode(req.body);
      setPasswordResetTokenCookie(res, passwordResetToken);
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
