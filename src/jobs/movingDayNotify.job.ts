import cron from "node-cron";

/**
 * 이사 당일 알림 — Phase 4 (알림 기능과 함께 구현)
 */
export async function notifyMovingDay(): Promise<void> {
  // TODO: Phase 4
}

export function scheduleMovingDayNotify() {
  cron.schedule("0 9 * * *", notifyMovingDay, { timezone: "Asia/Seoul" });
}
