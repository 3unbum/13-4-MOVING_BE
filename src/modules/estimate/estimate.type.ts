import z from "zod";
import type { EstimateStatus } from "../../../generated/prisma/enums.ts";
import type { PaymentStageFilter } from "./estimate.payment.ts";
import {
  paymentEstimateListQuerySchema,
  estimateListQuerySchema,
  estimatePaySchema,
  extraChargeProposeSchema,
  extraChargeRespondSchema,
  moverRequestQuerySchema,
} from "./estimate.schema.ts";

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
  paymentStage?: PaymentStageFilter;
  /** 최신순(기본) / 오래된 순 */
  sort?: "latest" | "oldest";
  /** "YYYY-MM" — 이사일이 그 달인 견적만 */
  month?: string;
  take?: number;
}

export interface EstimateGetAllByQuotationRequestParams {
  quotationRequestId: number;
  /** 여러 상태를 한 번에 보려면 배열을 넘깁니다 (대기 중인 견적이 PENDING + REJECTED 를 함께 봅니다) */
  estimateStatus?: EstimateStatus | EstimateStatus[];
  cursor?: number;
  take?: number;
}

export interface EstimateGetAllByCustomerParams {
  /** 견적 요청을 보낸 고객 */
  userId: number;
  estimateStatus?: EstimateStatus;
  paymentStage?: PaymentStageFilter;
  /** 최신순(기본) / 오래된 순 — 결제 내역은 결제일, 대기 중인 결제는 이사 완료일 기준 */
  sort?: "latest" | "oldest";
  /** "YYYY-MM" — 정렬과 같은 날짜가 그 달인 견적만 */
  month?: string;
  cursor?: number;
  take?: number;
}

export type estimateListQuery = z.infer<typeof estimateListQuerySchema>;
export type moverRequestQuery = z.infer<typeof moverRequestQuerySchema>;
export type paymentEstimateListQuery = z.infer<typeof paymentEstimateListQuerySchema>;
export type estimatePayInput = z.infer<typeof estimatePaySchema>;
export type extraChargeProposeInput = z.infer<typeof extraChargeProposeSchema>;
export type extraChargeRespondInput = z.infer<typeof extraChargeRespondSchema>;
