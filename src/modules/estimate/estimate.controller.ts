import type { Request, RequestHandler, Response } from "express";
import * as estimateService from "./estimate.service";
import type {
  paymentEstimateListQuery,
  estimateListQuery,
  moverRequestQuery,
} from "./estimate.type";

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };

export const estimateController = {
  // GET /mover/estimates (#33)
  getMoverEstimates: wrap(async (req, res) => {
    const result = await estimateService.getMoverEstimates(
      req.user!.id,
      req.query as unknown as paymentEstimateListQuery
    );
    res.json({ data: result });
  }),

  // GET /estimates/pending (#26)
  getPendingEstimates: wrap(async (req, res) => {
    const result = await estimateService.getPendingEstimates(
      req.user!.id,
      req.query as unknown as estimateListQuery
    );
    res.json({ data: result });
  }),

  // GET /estimates (#140)
  getCustomerEstimates: wrap(async (req, res) => {
    const result = await estimateService.getCustomerEstimates(
      req.user!.id,
      req.query as unknown as paymentEstimateListQuery
    );
    res.json({ data: result });
  }),

  // GET requests/:quotationRequestId/estimates (#27)
  getQuotationEstimates: wrap(async (req, res) => {
    const result = await estimateService.getQuotationEstimates(
      req.user!.id,
      Number(req.params.quotationRequestId),
      req.query as unknown as estimateListQuery
    );
    res.json({ data: result });
  }),

  // GET /estimates/{id}, GET /mover/estimates/{id} (#28, #34)
  getById: wrap(async (req, res) => {
    const result = await estimateService.getById(
      Number(req.params.id),
      req.user!.id,
      req.user!.role
    );
    res.json({ data: result });
  }),

  // POST /mover/requests/{id}/reject (#32)
  reject: wrap(async (req, res) => {
    const result = await estimateService.reject(
      Number(req.params.id),
      req.user!.id,
      req.body.comment
    );
    res.status(201).json({ data: result });
  }),

  // POST /mover/requests/{id}/estimates (#31)
  save: wrap(async (req, res) => {
    const result = await estimateService.save(
      Number(req.params.id),
      req.user!.id,
      req.body.price,
      req.body.comment
    );
    res.status(201).json({ data: result });
  }),

  // POST /estimates/{id}/confirm (#29)
  confirm: wrap(async (req, res) => {
    const result = await estimateService.confirm(Number(req.params.id), req.user!.id);
    res.json({ data: result });
  }),

  // POST /mover/estimates/{id}/payment-request (#140)
  requestPayment: wrap(async (req, res) => {
    const result = await estimateService.requestPayment(Number(req.params.id), req.user!.id);
    res.json({ data: result });
  }),

  // POST /mover/estimates/{id}/extra-charge (#140)
  proposeExtraCharge: wrap(async (req, res) => {
    const result = await estimateService.proposeExtraCharge(
      Number(req.params.id),
      req.user!.id,
      req.body
    );
    res.json({ data: result });
  }),

  // PATCH /mover/estimates/{id}/extra-charge/{chargeId} (#140)
  updateExtraCharge: wrap(async (req, res) => {
    const result = await estimateService.updateExtraCharge(
      Number(req.params.id),
      Number(req.params.chargeId),
      req.user!.id,
      req.body
    );
    res.json({ data: result });
  }),

  // POST /estimates/{id}/extra-charge/respond (#140)
  respondExtraCharge: wrap(async (req, res) => {
    const result = await estimateService.respondExtraCharge(
      Number(req.params.id),
      req.user!.id,
      req.body
    );
    res.json({ data: result });
  }),

  // POST /estimates/{id}/pay (#140)
  pay: wrap(async (req, res) => {
    const result = await estimateService.pay(Number(req.params.id), req.user!.id, req.body);
    res.json({ data: result });
  }),

  // GET /mover/requests (#30)
  getMoverRequests: wrap(async (req, res) => {
    const result = await estimateService.getMoverRequests(
      req.user!.id,
      req.query as unknown as moverRequestQuery
    );
    res.json({ data: result });
  }),
};
