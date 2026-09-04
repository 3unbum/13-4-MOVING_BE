const KST = "Asia/Seoul";

// en-CA는 YYYY-MM-DD 형식이라 별도 파싱 없이 그대로 쓸 수 있습니다.
const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 이사일 경과 판정 기준일 (KST 기준 오늘 00:00을 UTC 자정으로 표현).
 *
 * moving_date는 @db.Date라 UTC 자정으로 저장되므로, 비교 기준도 UTC 자정이어야 합니다.
 *
 * ⚠️ now.getFullYear() 계열을 쓰면 안 됩니다. 프로세스 로컬 타임존을 따르기 때문에
 * 서버가 UTC로 돌면 KST 09-05 00:10(= UTC 09-04 15:10)에 09-04를 반환해
 * 하루 늦게 처리됩니다. node-cron의 timezone 옵션은 실행 "시각"만 제어할 뿐
 * Date 계산에는 영향이 없어, KST 개발 환경에서는 드러나지 않고 배포 후에 터집니다.
 * 그래서 KST 기준 연·월·일을 명시적으로 뽑아 조립합니다.
 */
export function getExpireBaseDate(now: Date = new Date()): Date {
  const [year, month, day] = kstDateFormatter.format(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
