import z from "zod";
import type { EstimateStatus } from "../../../generated/prisma/enums.ts";
import { estimateListQuerySchema, moverRequestQuerySchema } from "./estimate.schema.ts";

export interface EstimateInputField {
  moverId: number;
  price: number;
  comment: string;
  quotationRequestId: number;
}
export interface EstimateRejectInput {
  quotationRequestId: number;
  moverId: number;
  comment: string;
}

export interface EstimateGetAllByMoverParams {
  moverId: number;
  cursor?: number;
  estimateStatus?: EstimateStatus;
  take?: number;
}

export interface EstimateGetAllByQuotationRequestParams {
  quotationRequestId: number;
  estimateStatus?: EstimateStatus;
  cursor?: number;
  take?: number;
}

export type estimateListQuery = z.infer<typeof estimateListQuerySchema>;
export type moverRequestQuery = z.infer<typeof moverRequestQuerySchema>;
