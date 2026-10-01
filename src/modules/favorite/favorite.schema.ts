import { z } from "zod";

export const createFavoriteSchema = z.object({
  moverId: z.coerce.number().int().positive("moverId는 양의 정수여야 합니다"),
});

export type CreateFavoriteDto = z.infer<typeof createFavoriteSchema>;

/** 없으면 전체, 있으면 최신 N명 (찾기 PC 좌측은 3) */
export const listFavoritesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, "limit는 1 이상이어야 합니다")
    .max(3, "limit는 최대 3입니다")
    .optional(),
});

export type ListFavoritesQuery = z.infer<typeof listFavoritesQuerySchema>;

export const bulkDeleteFavoritesSchema = z.object({
  moverIds: z
    .array(z.coerce.number().int().positive("moverId는 양의 정수여야 합니다"))
    .min(1, "삭제할 기사님을 선택해주세요")
    .max(50, "한 번에 50명까지 해제할 수 있습니다"),
});

export type BulkDeleteFavoritesDto = z.infer<typeof bulkDeleteFavoritesSchema>;
