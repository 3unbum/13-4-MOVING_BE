import type { RequestHandler } from "express";
import { authService } from "./auth.service";

export const authController = {
  signup: (async (req, res, next) => {
    try {
      const result = await authService.signup(req.body);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  login: (async (req, res, next) => {
    try {
      const result = await authService.login(req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
