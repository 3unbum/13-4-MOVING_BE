import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { reviewService } from "./review.service";
import type { ConfirmReviewDto, ReviewIdParam, ReviewListQuery } from "./review.schema";

function getUserId(req: { user?: { id: number } }) {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user.id;
}

export const reviewController = {
  listWritable: (async (req, res, next) => {
    try {
      const result = await reviewService.listWritable(
        getUserId(req),
        req.query as unknown as ReviewListQuery
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listWritten: (async (req, res, next) => {
    try {
      const result = await reviewService.listWritten(
        getUserId(req),
        req.query as unknown as ReviewListQuery
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listReceived: (async (req, res, next) => {
    try {
      const result = await reviewService.listReceived(
        getUserId(req),
        req.query as unknown as ReviewListQuery
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  confirm: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as ReviewIdParam;
      const result = await reviewService.confirm(getUserId(req), id, req.body as ConfirmReviewDto);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
