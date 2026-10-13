import type { Prisma } from "../../../generated/prisma/client.ts";
import type {
  EstimateStatus,
  ExtraChargeStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums.ts";

/** 추가 금액 한 건 — 잔금·상한 계산에 필요한 필드만 */
export interface ExtraChargeLike {
  amount: number;
  status: ExtraChargeStatus;
}

/** 선수금 = 견적 금액의 10% */
export const DEPOSIT_RATE = 0.1;

/** 추가 금액 상한 — 견적 금액의 20% (거절되지 않은 건의 합계에 적용) */
export const EXTRA_CHARGE_MAX_RATE = 0.2;

/** 추가 금액 최소 — 자잘한 금액으로 고객 알림이 쌓이지 않게 합니다 */
export const EXTRA_CHARGE_MIN_AMOUNT = 1000;

/** 선수금 결제 기한 — 확정 후 48시간 */
export const DEPOSIT_DUE_MS = 48 * 60 * 60 * 1000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 선수금 결제 종류. 주문 번호와 승인 금액 검증이 이 값으로 갈립니다 */
export type PaymentType = "DEPOSIT" | "BALANCE";

/**
 * 선수금 금액 — 견적 금액의 10%, 10원 단위 내림.
 * 견적 최소가 1만 원이라 결과는 항상 1,000원 이상입니다 (토스 최소 결제 금액을 넘습니다).
 */
export function calcDepositAmount(price: number): number {
  return Math.floor((price * DEPOSIT_RATE) / 10) * 10;
}

/**
 * 선수금 결제 기한 = min(확정 + 48시간, 이사일 0시 KST).
 *
 * `movingDate`는 @db.Date라 달력일을 UTC 자정으로 저장합니다(expireRequests.util 참고).
 * KST 자정은 거기서 9시간을 뺀 시각입니다. 이사일이 임박해도 기한이 이사일을 넘지 않습니다.
 */
export function calcDepositDueAt(now: Date, movingDate: Date): Date {
  const moveDayStartKst = movingDate.getTime() - KST_OFFSET_MS;
  return new Date(Math.min(now.getTime() + DEPOSIT_DUE_MS, moveDayStartKst));
}

/**
 * 추가 금액 상한 — 견적 금액의 20%, 10원 단위 내림.
 * 요청 시 검증에 쓰고, 기사님 화면의 입력 안내에도 같은 값을 내려줍니다.
 */
export function calcExtraChargeMax(price: number | null): number {
  return Math.floor(((price ?? 0) * EXTRA_CHARGE_MAX_RATE) / 10) * 10;
}

/** 추가 금액 합계 — 지정한 상태의 건만 더합니다 */
export function sumExtraCharges(
  charges: ExtraChargeLike[] | undefined,
  statuses: ExtraChargeStatus[]
): number {
  return (charges ?? [])
    .filter((c) => statuses.includes(c.status))
    .reduce((s, c) => s + c.amount, 0);
}

/**
 * 잔금 = 견적 금액 − 선수금 + 승인된 추가 금액 합계.
 * 선수금이 없는 옛 견적은 전액이고, 추가 금액은 **고객이 승인한 건만** 합산합니다(요청 중·거절은 제외).
 */
export function calcBalanceAmount(estimate: {
  price: number | null;
  depositAmount: number | null;
  extraCharges?: ExtraChargeLike[];
}): number {
  const extra = sumExtraCharges(estimate.extraCharges, ["APPROVED"]);
  return (estimate.price ?? 0) - (estimate.depositAmount ?? 0) + extra;
}

/**
 * 견적이 지금 어떤 결제 단계인지.
 *
 *   DEPOSIT_DUE  확정됐고 선수금을 아직 안 냄 (기한 안에 내야 함)
 *   BALANCE_DUE  이사가 끝났고 잔금을 아직 안 냄 (선수금을 냈거나 선수금이 없는 옛 견적)
 *   PAID         잔금까지 모두 결제함
 *   NONE         결제할 단계가 아님 (대기·반려·이사 전 등)
 */
export type PaymentStage = "DEPOSIT_DUE" | "BALANCE_DUE" | "PAID" | "NONE";

export function toPaymentStage(estimate: {
  estimateStatus: EstimateStatus;
  paymentStatus: PaymentStatus;
  depositAmount: number | null;
  depositPaidAt: Date | null;
}): PaymentStage {
  if (estimate.paymentStatus === "PAID") return "PAID";

  if (
    estimate.estimateStatus === "CONFIRMED" &&
    estimate.depositAmount !== null &&
    estimate.depositPaidAt === null
  ) {
    return "DEPOSIT_DUE";
  }

  if (
    estimate.estimateStatus === "COMPLETED" &&
    (estimate.depositAmount === null || estimate.depositPaidAt !== null)
  ) {
    return "BALANCE_DUE";
  }

  return "NONE";
}

/**
 * 단계별 where 조각 — 목록 필터, 결제 요청, 결제 기록의 조건부 갱신이 같은 조건을 씁니다.
 * `toPaymentStage`와 같은 규칙이라, 한쪽을 고치면 다른 쪽도 같이 고쳐야 합니다.
 */
export const depositDueWhere: Prisma.EstimateWhereInput = {
  estimateStatus: "CONFIRMED",
  depositAmount: { not: null },
  depositPaidAt: null,
};

export const balanceDueWhere: Prisma.EstimateWhereInput = {
  estimateStatus: "COMPLETED",
  paymentStatus: "UNPAID",
  OR: [{ depositAmount: null }, { depositPaidAt: { not: null } }],
};

/** 목록 탭: DUE = 대기 중인 결제(선수금 + 잔금), PAID = 결제 내역(잔금까지 완료) */
export type PaymentStageFilter = "DUE" | "PAID";

export function paymentStageWhere(stage: PaymentStageFilter): Prisma.EstimateWhereInput {
  return stage === "PAID" ? { paymentStatus: "PAID" } : { OR: [depositDueWhere, balanceDueWhere] };
}

/**
 * "YYYY-MM" 한 달의 이사일 범위 [시작, 다음 달 시작).
 * `movingDate`는 @db.Date라 달력일을 UTC 자정으로 저장하므로 UTC 기준으로 자릅니다(expireRequests.util 참고).
 */
export function monthRange(month: string): { gte: Date; lt: Date } {
  const [year, mon] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(year, mon - 1, 1)), lt: new Date(Date.UTC(year, mon, 1)) };
}

/**
 * "YYYY-MM" 한 달의 KST 범위 [시작, 다음 달 시작) — 결제 시각(`paidAt`)처럼 실제 시각 컬럼용.
 * KST 월초 0시는 UTC로 9시간 전입니다. (`movingDate`는 달력일 컬럼이라 `monthRange`를 씁니다)
 */
export function kstMonthRange(month: string): { gte: Date; lt: Date } {
  const { gte, lt } = monthRange(month);
  return {
    gte: new Date(gte.getTime() - KST_OFFSET_MS),
    lt: new Date(lt.getTime() - KST_OFFSET_MS),
  };
}
