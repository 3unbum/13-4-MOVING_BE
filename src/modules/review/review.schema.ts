import { z } from "zod";

export const reviewListQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  take: z.coerce.number().int().min(1).max(20).optional(),
});

export const reviewIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const confirmReviewSchema = z.object({
  rating: z.coerce
    .number()
    .int()
    .min(1, "평점은 1 이상이어야 합니다")
    .max(5, "평점은 5 이하여야 합니다"),
  comment: z
    .string()
    .min(10, "코멘트는 10자 이상이어야 합니다")
    .max(200, "코멘트는 200자 이하여야 합니다"),
});

export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export type ReviewIdParam = z.infer<typeof reviewIdParamSchema>;
export type ConfirmReviewDto = z.infer<typeof confirmReviewSchema>;
