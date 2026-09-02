import type { RequestHandler } from "express";
import { authService } from "./auth.service";
import { setAuthCookies } from "../../common/utils/cookie.util";

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
};
