import type { RequestHandler } from "express";
import type { MoverIdParam, MoverListQuery } from "./mover.schema";
import { moverService } from "./mover.service";

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
};
