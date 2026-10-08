import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { env } from "@/config/env";
import type { PaymentType } from "./estimate.payment";

const CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";
const TIMEOUT_MS = 10_000;

/// 견적·결제 종류마다 주문 번호가 하나 — 클라이언트가 보낸 orderId가 이 값과 다르면 거절한다.
/// 선수금과 잔금은 서로 다른 결제라 번호도 다르다 (`moving-deposit-12`, `moving-balance-12`).
/// 토스 규칙: 6~64자 영문 대소문자·숫자·`-`·`_`
export const toPaymentOrderId = (estimateId: number, type: PaymentType) =>
  `moving-${type.toLowerCase()}-${estimateId}`;

/**
 * 토스페이먼츠 결제 승인.
 *
 * - `TOSS_SECRET_KEY`가 비어 있으면 호출을 건너뜁니다 (로컬·CI). 테스트 키(`test_…`)를 쓰면
 *   토스 샌드박스에서 승인되고 실제 청구는 일어나지 않습니다.
 * - Idempotency-Key로 orderId를 보내, 같은 요청을 다시 보내도 중복 승인되지 않게 합니다.
 * - 승인 실패는 토스가 준 사유(`message`)를 그대로 PAYMENT_FAILED로 돌려줍니다. 응답을 못 받은
 *   경우(네트워크·타임아웃)는 승인 여부를 알 수 없어 일반 실패로 처리합니다.
 *   // ponytail: 승인 성공 후 DB 갱신이 실패하면 결제만 되고 견적은 UNPAID로 남는다 — 웹훅/재조회 보정은 범위 밖
 */
export async function confirmTossPayment(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}) {
  if (!env.TOSS_SECRET_KEY) return;

  const authorization = `Basic ${Buffer.from(`${env.TOSS_SECRET_KEY}:`).toString("base64")}`;

  let response: Response;
  try {
    response = await fetch(CONFIRM_URL, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        "Idempotency-Key": input.orderId,
      },
      // type 같은 우리 쪽 필드가 토스로 나가지 않도록 승인에 필요한 셋만 보낸다
      body: JSON.stringify({
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw AppError.badRequest(ERROR_CODES.PAYMENT_FAILED, "결제 승인에 실패했습니다");
  }

  if (response.ok) return;

  const failure = (await response.json().catch(() => null)) as { message?: string } | null;
  throw AppError.badRequest(
    ERROR_CODES.PAYMENT_FAILED,
    failure?.message ?? "결제 승인에 실패했습니다"
  );
}
