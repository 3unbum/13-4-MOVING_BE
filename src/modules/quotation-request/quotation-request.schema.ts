import z from "zod";
import { RegionType, ServiceType } from "../../../generated/prisma/enums";

const addressSchema = z.object({
  postalCode: z.string().min(1, "우편번호를 입력해 주세요."),
  region: z.enum(RegionType),
  address: z.string().min(1, "주소를 입력해 주세요."),
  detailAddress: z.string().min(1, "상세 주소를 입력해 주세요."),
});

export const quotationRequestCreateSchema = z
  .object({
    category: z.enum(ServiceType),
    movingDate: z.coerce.date(),
    from: addressSchema,
    to: addressSchema,
  })
  .refine(
    (data) => {
      // 이사일은 날짜 문자열이 UTC 00:00으로 파싱되므로, 오늘 날짜도 UTC 기준으로 맞춥니다
      const now = new Date();
      const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      return data.movingDate.getTime() > todayUtc;
    },
    {
      message: "이사 예정일은 내일 이후로 선택해 주세요.",
      path: ["movingDate"],
    }
  )
  .refine(
    (data) =>
      !(
        data.from.postalCode === data.to.postalCode &&
        data.from.address === data.to.address &&
        data.from.detailAddress === data.to.detailAddress
      ),
    {
      message: "출발지와 도착지가 같습니다.",
      path: ["to"],
    }
  );

/** GET /quotation-requests 쿼리. status=pending이면 활성 요청 1건만 조회합니다. */
export const quotationRequestListQuerySchema = z.object({
  status: z.literal("pending").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * POST /quotation-requests/:id/targeted-requests 본문
 *
 * body는 JSON이라 coerce를 쓰지 않습니다.
 * z.coerce.number()는 Number(true)=1이라 `{"moverId":true}`가 통과합니다.
 */
export const targetedRequestCreateSchema = z.object({
  moverId: z.number().int().positive(),
});

/** 경로 파라미터 :id 검증 */
export const quotationRequestIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type QuotationRequestCreateDto = z.infer<typeof quotationRequestCreateSchema>;
export type QuotationRequestListQuery = z.infer<typeof quotationRequestListQuerySchema>;
export type QuotationRequestIdParam = z.infer<typeof quotationRequestIdParamsSchema>;
export type TargetedRequestCreateDto = z.infer<typeof targetedRequestCreateSchema>;
