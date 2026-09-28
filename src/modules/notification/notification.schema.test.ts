import {
  bulkDeleteNotificationsSchema,
  notificationIdParamSchema,
  notificationListQuerySchema,
} from "./notification.schema";

describe("notificationListQuerySchema", () => {
  it("쿼리가 없으면 통과한다", () => {
    expect(notificationListQuerySchema.safeParse({}).success).toBe(true);
  });

  it("문자열 cursor·take를 숫자로 변환한다", () => {
    const result = notificationListQuerySchema.safeParse({ cursor: "12", take: "5" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ cursor: 12, take: 5 });
    }
  });

  it("take가 20을 넘으면 실패한다", () => {
    expect(notificationListQuerySchema.safeParse({ take: 21 }).success).toBe(false);
  });

  it("cursor가 0이면 실패한다", () => {
    expect(notificationListQuerySchema.safeParse({ cursor: 0 }).success).toBe(false);
  });

  it("isRead=false는 false로 남긴다", () => {
    const result = notificationListQuerySchema.safeParse({ isRead: "false" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isRead).toBe("false");
    }
  });
});

describe("notificationIdParamSchema", () => {
  it("문자열 id를 숫자로 변환한다", () => {
    const result = notificationIdParamSchema.safeParse({ id: "7" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(7);
    }
  });

  it("숫자가 아니면 실패한다", () => {
    expect(notificationIdParamSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});

describe("bulkDeleteNotificationsSchema", () => {
  it("ids 배열을 통과시킨다", () => {
    expect(bulkDeleteNotificationsSchema.safeParse({ ids: [1, 2, 3] }).success).toBe(true);
  });

  it("빈 배열이면 실패한다", () => {
    expect(bulkDeleteNotificationsSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it("50건을 넘으면 실패한다", () => {
    const ids = Array.from({ length: 51 }, (_, index) => index + 1);
    expect(bulkDeleteNotificationsSchema.safeParse({ ids }).success).toBe(false);
  });
});
