/**
 * 이사일 경과 판정 기준일.
 *
 * moving_date는 @db.Date라 UTC 자정으로 저장되므로, 비교 기준도 UTC 자정이어야 합니다.
 * new Date()를 그대로 쓰면 KST 자정 직후(UTC 기준 전날 15시)에 하루가 어긋납니다.
 */
export function getExpireBaseDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
