jest.mock("../../config/prisma", () => ({ prisma: {} }));

import { CHAT_RETENTION_DAYS, isRoomClosed } from "./chat.repository";

/** 완료일 D(KST) 00시부터 14일: D+14 00시(KST)에 닫힌다 */
const completedAt = (iso: string) => ({ estimateStatus: "COMPLETED", updatedAt: new Date(iso) });

describe("isRoomClosed (완료일 KST 00시 기준 14일)", () => {
  it("보존 기간은 14일이다", () => {
    expect(CHAT_RETENTION_DAYS).toBe(14);
  });

  it("확정 상태는 기간과 무관하게 열려 있다", () => {
    const now = new Date("2026-10-10T03:00:00.000Z");
    expect(
      isRoomClosed({ estimateStatus: "CONFIRMED", updatedAt: new Date("2026-01-01") }, now)
    ).toBe(false);
  });

  it("완료일 10/3(KST)이면 10/16 23:59(KST)까지 열려 있고 10/17 00:00(KST)에 닫힌다", () => {
    // 완료 10/3 12:00 KST = 10/3 03:00 UTC
    const est = completedAt("2026-10-03T03:00:00.000Z");
    // 10/16 23:59:59 KST = 10/16 14:59:59 UTC
    expect(isRoomClosed(est, new Date("2026-10-16T14:59:59.000Z"))).toBe(false);
    // 10/17 00:00:00 KST = 10/16 15:00:00 UTC
    expect(isRoomClosed(est, new Date("2026-10-16T15:00:00.000Z"))).toBe(true);
  });

  it("완료일 자정 직전(KST 전날 23:59)에 완료된 건 전날 기준으로 센다", () => {
    // 완료 10/2 23:59 KST = 10/2 14:59 UTC → 완료일 10/2 → 10/16 00:00 KST(= 10/15 15:00 UTC)에 닫힘
    const est = completedAt("2026-10-02T14:59:00.000Z");
    expect(isRoomClosed(est, new Date("2026-10-15T14:59:59.000Z"))).toBe(false);
    expect(isRoomClosed(est, new Date("2026-10-15T15:00:00.000Z"))).toBe(true);
  });

  it("15일 지난 완료 건은 닫혀 있다", () => {
    expect(
      isRoomClosed(completedAt("2026-09-17T05:00:00.000Z"), new Date("2026-10-02T06:00:00.000Z"))
    ).toBe(true);
  });
});
