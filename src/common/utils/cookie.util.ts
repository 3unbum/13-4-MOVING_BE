import type { CookieOptions, Response } from "express";
import ms from "ms";
import { env, isProduction } from "../../config/env";

/**
 * 프론트(Next.js rewrites)가 same-origin으로 중계하므로 Domain은 지정하지 않는다.
 * SameSite=Lax + Secure(prod only)로 보안 요구사항(CSRF 방지)을 만족한다.
 */
export const ACCESS_TOKEN_COOKIE = "accessToken";
export const REFRESH_TOKEN_COOKIE = "refreshToken";

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};

/** access token 쿠키만 새로 굽습니다. 토큰갱신(rotation 없음)에서 refreshToken은 안 건드리고 이것만 다시 씁니다. */
export const setAccessTokenCookie = (res: Response, accessToken: string): void => {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...baseCookieOptions,
    maxAge: ms(env.JWT_EXPIRES_IN as ms.StringValue),
  });
};

export const setAuthCookies = (
  res: Response,
  tokens: { accessToken: string; refreshToken: string }
): void => {
  setAccessTokenCookie(res, tokens.accessToken);
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions,
    maxAge: ms(env.JWT_REFRESH_EXPIRES_IN as ms.StringValue),
  });
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_TOKEN_COOKIE, baseCookieOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE, baseCookieOptions);
};
