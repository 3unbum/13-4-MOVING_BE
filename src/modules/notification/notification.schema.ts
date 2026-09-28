import { z } from "zod";

/**
 * 목록 쿼리.
 * isRead 생략 → 전체(읽음+안읽음). "true"/"false"면 그 상태만 필터.
 * 쿼리스트링 boolean coerce가 "false"를 true로 만드는 문제를 피하려고 enum 문자열로 받습니다.
 */
export const listNotificationsQuerySchema = z.object({
  isRead: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const notificationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const bulkDeleteNotificationsSchema = z.object({
  ids: z
    .array(z.coerce.number().int().positive("id는 양의 정수여야 합니다"))
    .min(1, "삭제할 알림을 선택해주세요")
    .max(50, "한 번에 50개까지 삭제할 수 있습니다"),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
export type BulkDeleteNotificationsDto = z.infer<typeof bulkDeleteNotificationsSchema>;
