import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import type { PostMessageDto, SessionIdParam } from "./mover-ai.schema";
import { moverAiService } from "./mover-ai.service";

function getUserId(req: { user?: { id: number } }) {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user.id;
}

export const moverAiController = {
  createSession: (async (req, res, next) => {
    try {
      const data = await moverAiService.createSession(getUserId(req));
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  getSession: (async (req, res, next) => {
    try {
      const { sessionId } = req.params as unknown as SessionIdParam;
      const data = await moverAiService.getSession(getUserId(req), sessionId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  postMessage: (async (req, res, next) => {
    try {
      const { sessionId } = req.params as unknown as SessionIdParam;
      const body = req.body as PostMessageDto;
      const data = await moverAiService.postMessage(getUserId(req), sessionId, body);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
