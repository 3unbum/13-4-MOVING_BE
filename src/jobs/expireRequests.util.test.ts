import { getExpireBaseDate } from "./expireRequests.util";

// 입력은 모두 UTC(Z)로 명시합니다.
// new Date(2026, 8, 4)처럼 로컬 생성자를 쓰면 테스트가 프로세스 타임존을 타서
// "서버가 UTC일 때 하루 어긋나는" 버그 자체를 잡지 못합니다.
describe("getExpireBaseDate", () => {
  it("KST 낮 시간대는 당일을 반환한다", () => {
    // UTC 09-04 04:30 = KST 09-04 13:30
    const result = getExpireBaseDate(new Date("2026-09-04T04:30:00.000Z"));
    expect(result.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("KST 자정 직후는 UTC로 전날이지만 KST 당일을 반환한다", () => {
    // UTC 09-04 15:10 = KST 09-05 00:10 — 배치가 실제로 도는 시각
    // 로컬 타임존에 의존하면 09-04를 반환해 하루 늦게 처리된다
    const result = getExpireBaseDate(new Date("2026-09-04T15:10:00.000Z"));
    expect(result.toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });

  it("KST 자정 직전은 아직 전날을 반환한다", () => {
    // UTC 09-04 14:59 = KST 09-04 23:59
    const result = getExpireBaseDate(new Date("2026-09-04T14:59:00.000Z"));
    expect(result.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("월 경계를 넘어가도 KST 기준으로 정확하다", () => {
    // UTC 08-31 15:00 = KST 09-01 00:00
    const result = getExpireBaseDate(new Date("2026-08-31T15:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("연 경계를 넘어가도 KST 기준으로 정확하다", () => {
    // UTC 12-31 15:00 = KST 2027-01-01 00:00
    const result = getExpireBaseDate(new Date("2026-12-31T15:00:00.000Z"));
    expect(result.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("시·분·초를 모두 0으로 만든다", () => {
    const result = getExpireBaseDate(new Date("2026-09-04T04:45:30.500Z"));
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });
});
