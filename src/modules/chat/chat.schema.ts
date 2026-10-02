import { z } from "zod";

/** 알림 목록과 같은 커서 규격 (default 10, max 20) */
export const chatRoomListQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  take: z.coerce.number().int().min(1).max(20).optional(),
});

export type ChatRoomListQuery = z.infer<typeof chatRoomListQuerySchema>;

export const chatRoomIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** 메시지는 위로 올려 보는 방향이라 기본값을 방 목록보다 크게 잡습니다 (default 30, max 50) */
export const chatMessageListQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  take: z.coerce.number().int().min(1).max(50).optional(),
});

export const sendChatMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "메시지를 입력해주세요")
    .max(1000, "메시지는 1000자까지 보낼 수 있습니다"),
});

export type ChatRoomIdParam = z.infer<typeof chatRoomIdParamSchema>;
export type ChatMessageListQuery = z.infer<typeof chatMessageListQuerySchema>;
export type SendChatMessageDto = z.infer<typeof sendChatMessageSchema>;
