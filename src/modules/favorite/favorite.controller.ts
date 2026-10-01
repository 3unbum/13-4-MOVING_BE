import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { favoriteService } from "./favorite.service";
import type {
  BulkDeleteFavoritesDto,
  CreateFavoriteDto,
  ListFavoritesQuery,
} from "./favorite.schema";

function getUserId(req: { user?: { id: number } }) {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user.id;
}

export const favoriteController = {
  list: (async (req, res, next) => {
    try {
      const { limit } = req.query as ListFavoritesQuery;
      const result = await favoriteService.list(getUserId(req), limit);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  create: (async (req, res, next) => {
    try {
      const { moverId } = req.body as CreateFavoriteDto;
      const result = await favoriteService.create(getUserId(req), moverId);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  bulkDelete: (async (req, res, next) => {
    try {
      const { moverIds } = req.body as BulkDeleteFavoritesDto;
      const result = await favoriteService.bulkDelete(getUserId(req), moverIds);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
