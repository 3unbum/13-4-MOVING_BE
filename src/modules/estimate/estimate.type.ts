import type { EstimateStatus } from "../../../generated/prisma/enums.ts";

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
  take?: number;
}

export interface EstimateGetAllByQuotationRequestParams {
  quotationRequestId: number;
  estimateStatus?: EstimateStatus;
}
