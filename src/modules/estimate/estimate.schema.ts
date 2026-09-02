import z from "zod";
import { EstimateStatus, ServiceType } from "../../../generated/prisma/enums";

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

export const estimateListQuerySchema = z.object({
  cursor: z.coerce.number().int().optional(),
  take: z.coerce.number().int().min(1).max(20).optional(), //악의적인 호출 값을 막는 설정
  status: z.enum(EstimateStatus).optional(),
});

// mover 받은 요청 목록 — status 대신 프론트 체크박스 필터(서비스 가능 지역/지정 견적/이사 유형) + 정렬 옵션 추가
export const moverRequestQuerySchema = estimateListQuerySchema.omit({ status: true }).extend({
  isServiceRegion: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  isTargeted: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  category: z.enum(ServiceType).optional(),
  // latest(기본, 요청 등록 최신순) | movingDate(이사 빠른순) | targetedAt(지정받은 시점순)
  sort: z.enum(["latest", "movingDate", "targetedAt"]).optional(),
});
