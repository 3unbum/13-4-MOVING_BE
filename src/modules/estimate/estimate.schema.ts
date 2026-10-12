import z from "zod";
import { EstimateStatus, ServiceType } from "../../../generated/prisma/enums";

const estimateFields = {
  // 상한이 없으면 Postgres `Int`(2^31-1)를 넘겨 DB에서 "integer out of range"로 터집니다.
  // 1억 원은 이사 견적으로 충분히 넉넉하면서 오타·장난 입력을 걸러냅니다 (1차 QA-16).
  price: z
    .int()
    .min(10000, "최소 견적 가격은 10,000원 이상입니다.")
    .max(100_000_000, "견적 가격은 1억 원 이하로 입력해 주세요."),
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

// 결제 탭용 견적 목록 (#140) — 이사가 끝난 견적을 결제 여부로 나눠 봅니다 (대기 중인 결제 / 결제 내역 탭).
// 고객(`GET /estimates`)과 기사님(`GET /mover/estimates`) 목록이 함께 씁니다.
export const paymentEstimateListQuerySchema = estimateListQuerySchema.extend({
  // DUE = 대기 중인 결제(선수금 + 잔금), PAID = 결제 내역
  paymentStage: z.enum(["DUE", "PAID"]).optional(),
  // 정렬 — latest(최신순, 기본) / oldest(오래된 순). 기준은 카드에 보이는 날짜(결제 내역은 결제일, 대기 중인 결제는 이사 완료일), 커서는 견적 id
  sort: z.enum(["latest", "oldest"]).optional(),
  // 월별 조회 — "YYYY-MM". 정렬과 같은 날짜가 그 달인 견적만 봅니다
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month는 YYYY-MM 형식이어야 합니다.")
    .optional(),
});

// 견적 결제 승인 (#140) — 토스 결제창이 successUrl로 돌려주는 값 그대로
export const estimatePaySchema = z.object({
  type: z.enum(["DEPOSIT", "BALANCE"]),
  paymentKey: z.string().min(1).max(200),
  orderId: z.string().min(6).max(64),
  amount: z.int().positive(),
});

// 추가 금액 요청 (#140, 2단계) — 사유와 금액. 견적 금액 대비 20% 상한은 견적을 읽어야 알 수 있어 서비스에서 검증합니다.
export const extraChargeProposeSchema = z.object({
  amount: z
    .int()
    .min(1000, "추가 금액은 1,000원 이상이어야 합니다.")
    .max(100_000_000, "추가 금액은 1억 원 이하로 입력해 주세요."),
  reason: z
    .string()
    .trim()
    .min(1, "사유를 입력해 주세요.")
    .max(200, "사유는 200자 이내로 입력해 주세요."),
});

// 고객의 추가 금액 승인·거절 — 고른 건(chargeIds)에 같은 결정을 한 번에 적용한다
export const extraChargeRespondSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  chargeIds: z.array(z.int().positive()).min(1).max(50),
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
  // 이사 유형은 중복 선택입니다(피그마 필터 시안). `?category=SMALL&category=HOME`처럼
  // 같은 키를 반복하면 Express가 배열로 넘겨주고, 하나만 오면 문자열이라 배열로 통일합니다.
  // 빈 배열은 "전체"와 같아서 필터를 걸지 않도록 undefined로 떨굽니다.
  category: z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      const list = Array.isArray(value) ? value : [value];
      return list.length > 0 ? list : undefined;
    },
    z.array(z.enum(ServiceType)).nonempty().optional()
  ),
  // latest(기본, 요청 등록 최신순) | movingDate(이사 빠른순) | targetedAt(지정받은 시점순)
  sort: z.enum(["latest", "movingDate", "targetedAt"]).optional(),
  // 고객 이름 부분 검색. 빈 문자열은 "검색 안 함"으로 취급합니다(?search= 로 붙는 경우)
  search: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional()
  ),
});
