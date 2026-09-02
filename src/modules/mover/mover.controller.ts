import type { RequestHandler } from "express";
import type { MoverIdParam } from "./mover.schema";
import { moverService } from "./mover.service";

export const moverController = {
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
