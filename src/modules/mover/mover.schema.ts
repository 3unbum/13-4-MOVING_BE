import z from "zod";
import { parseRegionLabel, parseServiceLabel } from "./mover.type";

/**필터 초기화시 파라미터를 비우거나 안 보내는 경우 대비 */
const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

export const moverIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "유효한 기사님 ID를 입력해주세요")
    .transform(Number)
    .pipe(z.number().int().positive("유효한 기사님 ID를 입력해주세요")),
});

export const moverListQuerySchema = z
  .object({
    keyword: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    region: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    service: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    sort: z.enum(["review", "rating", "career", "confirmed"]).optional().default("review"),
    cursor: z.preprocess(emptyToUndefined, z.string().optional()),
    limit: z.coerce.number().int().min(1).max(20).optional().default(10),
  })
  .superRefine((query, ctx) => {
    if (query.region && !parseRegionLabel(query.region)) {
      ctx.addIssue({
        code: "custom",
        path: ["region"],
        message: "유효한 지역을 입력해주세요",
      });
    }
    if (query.service && !parseServiceLabel(query.service)) {
      ctx.addIssue({
        code: "custom",
        path: ["service"],
        message: "유효한 서비스 종류를 입력해주세요",
      });
    }
  });

export const moverListCursorSchema = z.object({
  profileId: z.number().int().positive(),
  userId: z.number().int().positive(),
  reviewCount: z.number().int(),
  avgRating: z.number(),
  career: z.number().int(),
  confirmedCount: z.number().int(),
});

export const moverReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "page는 1 이상이어야 합니다").optional().default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, "limit는 1 이상이어야 합니다")
    .max(5, "limit는 최대 5입니다")
    .optional()
    .default(5),
});

export type MoverIdParam = z.infer<typeof moverIdParamSchema>;
export type MoverListQuery = z.infer<typeof moverListQuerySchema>;
export type MoverReviewsQuery = z.infer<typeof moverReviewsQuerySchema>;
