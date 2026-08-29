import type { PrismaTransaction } from "../../config/prisma";

export type NotificationType = "NEW_REQUEST" | "NEW_ESTIMATE" | "ESTIMATE_CONFIRMED" | "MOVING_DAY";

export interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  estimateId?: number;
  quotationRequestId?: number;
  message?: string;
}

/**
 * 알림 생성 — Phase 4에서 본문을 구현합니다.
 *
 * 지금 빈 함수로 두는 이유:
 * 알림 생성은 견적 요청/발송/확정 트랜잭션 "안에서" 호출됩니다.
 * 나중에 붙이려면 이미 완성된 남의 트랜잭션 코드를 다시 열어야 하므로,
 * 호출 지점만 미리 확보해 둡니다.
 *
 * 각 팀은 자기 트랜잭션에서 이 함수를 호출만 해두세요.
 * 시그니처는 확정된 것이므로 변경하지 마세요.
 */
export async function createNotification(
  _tx: PrismaTransaction,
  _params: CreateNotificationParams
): Promise<void> {
  // TODO: Phase 4에서 구현
  return;
}
