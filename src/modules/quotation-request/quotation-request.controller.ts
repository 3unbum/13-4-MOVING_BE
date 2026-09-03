import type { RequestHandler } from "express";
import type { QuotationRequestListQuery } from "./quotation-request.schema";
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

  /** status=pending 이면 활성 요청, 아니면 이력 목록 */
  list: (async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const { status, page, limit } = req.query as unknown as QuotationRequestListQuery;

      if (status === "pending") {
        const active = await service.findActive(userId);
        res.json({ data: active });
        return;
      }

      const result = await service.findMany(userId, page, limit);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  findById: (async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const id = Number(req.params.id);
      const found = await service.findById(id, userId);
      res.json({ data: found });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
