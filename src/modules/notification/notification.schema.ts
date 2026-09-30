import { z } from "zod";

/**
 * 리뷰 목록과 같은 커서 규격 (BE default 10, max 20).
 * isRead는 쿼리스트링이라 boolean coerce를 쓰면 "false"가 true가 됩니다. enum 문자열로 받습니다.
 */
export const notificationListQuerySchema = z.object({
  isRead: z.enum(["true", "false"]).optional(),
  cursor: z.coerce.number().int().positive().optional(),
  take: z.coerce.number().int().min(1).max(20).optional(),
});

export const notificationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** 드롭다운에서 한 번에 지울 수 있는 상한 — 찜 해제(50)와 같은 기준 */
export const bulkDeleteNotificationsSchema = z.object({
  ids: z
    .array(z.coerce.number().int().positive("id는 양의 정수여야 합니다"))
    .min(1, "삭제할 알림을 선택해주세요")
    .max(50, "한 번에 50건까지 삭제할 수 있습니다"),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
export type BulkDeleteNotificationsDto = z.infer<typeof bulkDeleteNotificationsSchema>;
