import type { RequestHandler } from "express";
import * as service from "./quotation-request.service";

export const quotationRequestController = {
  create: (async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const created = await service.create({ ...req.body, userId });
      res.status(201).json({ data: created });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  findActive: (async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const active = await service.findActive(userId);
      res.json({ data: active });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
