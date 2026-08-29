import cron from "node-cron";
import { prisma } from "../config/prisma";

/**
 * 이사일 경과 처리 — 매일 자정.
 *
 * ⚠️ MVP 필수. 이 배치가 활성 견적 요청을 해제하는 유일한 경로입니다.
 * 없으면 유저가 두 번째 견적 요청을 영원히 할 수 없고,
 * "작성 가능한 리뷰"도 생성되지 않습니다.
 *
 * 처리 내용:
 *   1. moving_date가 지난 quotation_request 조회
 *   2. 확정 견적 있음 → COMPLETED / 없음 → EXPIRED
 *   3. 해당 estimate → COMPLETED
 *   4. 확정 견적에 대해 review를 PENDING으로 생성
 */
export async function expireRequests(): Promise<void> {
  // TODO: 구현
  void prisma;
}

export function scheduleExpireRequests() {
  // 매일 00:00 (KST)
  cron.schedule("0 0 * * *", expireRequests, { timezone: "Asia/Seoul" });
}
