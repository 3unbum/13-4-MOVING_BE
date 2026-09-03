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

export type QuotationRequestCreateDto = z.infer<typeof quotationRequestCreateSchema>;
