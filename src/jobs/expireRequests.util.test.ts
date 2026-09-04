import { getExpireBaseDate } from "./expireRequests.util";

describe("getExpireBaseDate", () => {
  it("로컬 날짜를 UTC 자정으로 변환한다", () => {
    // 2026-09-04 23:30 (로컬)
    const result = getExpireBaseDate(new Date(2026, 8, 4, 23, 30));
    expect(result.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("자정 직후에도 당일 기준으로 계산한다", () => {
    // KST 자정 직후는 UTC로 전날 15시 — 하루 어긋나기 쉬운 지점
    const result = getExpireBaseDate(new Date(2026, 8, 4, 0, 10));
    expect(result.toISOString()).toBe("2026-09-04T00:00:00.000Z");
  });

  it("월이 바뀌는 경계에서도 정확하다", () => {
    const result = getExpireBaseDate(new Date(2026, 8, 1, 0, 5));
    expect(result.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("시·분·초를 모두 0으로 만든다", () => {
    const result = getExpireBaseDate(new Date(2026, 8, 4, 13, 45, 30, 500));
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });
});
