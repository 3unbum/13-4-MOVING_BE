import z from "zod";

const estimateFields = {
  price: z.int().min(10000, "최소 견적 가격은 10,000원 이상입니다."),
  comment: z
    .string()
    .min(10, "10자 이상 입력 부탁드립니다.")
    .max(200, "200자 이내로 입력 부탁드립니다."),
};

export const estimateCreateSchema = z.object({
  ...estimateFields,
});

export const estimateRejectSchema = z.object({
  ...estimateFields,
  price: estimateFields.price.optional(),
});
