import z from "zod";

export const moverIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "유효한 기사님 ID를 입력해주세요")
    .transform(Number)
    .pipe(z.number().int().positive("유효한 기사님 ID를 입력해주세요")),
});

export type MoverIdParam = z.infer<typeof moverIdParamSchema>;
