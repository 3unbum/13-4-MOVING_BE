import type { Request, RequestHandler } from "express";
import { authService } from "./auth.service";
import {
  setAuthCookies,
  setAccessTokenCookie,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
} from "../../common/utils/cookie.util";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";

const getRefreshTokenOrThrow = (req: Request): string => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!refreshToken) {
    throw new AppError(401, ERROR_CODES.REFRESH_TOKEN_INVALID, "인증 토큰이 없습니다");
  }
  return refreshToken;
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
};
