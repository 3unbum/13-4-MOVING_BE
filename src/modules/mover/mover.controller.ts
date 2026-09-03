import type { RequestHandler } from "express";
import { AppError } from "@/common/errors/AppError";
import type { MoverIdParam, MoverListQuery, MoverReviewsQuery } from "./mover.schema";
import { moverService } from "./mover.service";

function getUserId(req: { user?: { id: number } }) {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user.id;
}

export const moverController = {
  list: (async (req, res, next) => {
    try {
      const result = await moverService.list(req.query as unknown as MoverListQuery);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  getById: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as MoverIdParam;
      const data = await moverService.getById(id, req.user);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listReviews: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as MoverIdParam;
      const result = await moverService.listReviews(id, req.query as unknown as MoverReviewsQuery);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  createFavorite: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as MoverIdParam;
      const data = await moverService.createFavorite(getUserId(req), id);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  deleteFavorite: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as MoverIdParam;
      const data = await moverService.deleteFavorite(getUserId(req), id);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
