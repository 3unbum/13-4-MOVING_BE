import type { NotificationType, RegionType, ServiceType } from "../../../generated/prisma/enums.ts";

/**
 * 알림 문구는 BE에 저장하지 않습니다 (`notification.message`는 null 유지).
 * FE가 `type` + `payload` + 자신의 role로 문구를 조립하고 하이라이트를 처리합니다.
 *
 * payload도 컬럼이 아닙니다. estimateId·quotationRequestId로 원본을 join해
 * 조회 시점에 만듭니다 — 기사님 닉네임처럼 나중에 바뀌는 값이 알림에 굳지 않습니다.
 */

/**
 * 알림 생성 입력.
 * 호출부가 견적 요청·발송·확정 트랜잭션에 이미 깔려 있어 필드를 줄이지 마세요.
 */
export interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  estimateId?: number;
  quotationRequestId?: number;
  message?: string;
}

/** 기사님 수신 — "경기 지역의 소형이사 견적 요청이 도착했어요" */
export interface NewRequestPayload {
  category: ServiceType;
  fromRegion: RegionType;
  movingDate: Date;
}

/** 고객 수신 — "김코드 기사님의 소형이사 견적이 도착했어요" */
export interface NewEstimatePayload {
  moverNickName: string;
  category: ServiceType;
  price: number | null;
}

/** 기사님·고객 양쪽 수신. 같은 type이라 문구 분기는 FE가 role로 판단합니다 */
export interface EstimateConfirmedPayload {
  moverNickName: string;
  customerName: string;
  category: ServiceType;
}

/** 고객·기사님 수신 — "오늘은 경기(일산) → 서울(영등포) 이사 예정일이에요" */
export interface MovingDayPayload {
  fromAddress: string;
  toAddress: string;
  movingDate: Date;
}

interface NotificationBase {
  id: number;
  isRead: boolean;
  createdAt: Date;
  estimateId: number | null;
  quotationRequestId: number | null;
}

/** type으로 payload가 갈리는 판별 유니온 — FE가 좁히기만 하면 됩니다 */
export type NotificationItem =
  | (NotificationBase & { type: "NEW_REQUEST"; payload: NewRequestPayload })
  | (NotificationBase & { type: "NEW_ESTIMATE"; payload: NewEstimatePayload })
  | (NotificationBase & { type: "ESTIMATE_CONFIRMED"; payload: EstimateConfirmedPayload })
  | (NotificationBase & { type: "MOVING_DAY"; payload: MovingDayPayload });

export interface NotificationListResult {
  items: NotificationItem[];
  nextCursor: number | null;
  unreadCount: number;
}

/** 로그인 직후 요약 한 줄 — "경기 지역의 소형이사 견적 3건" */
export interface NotificationSummaryItem {
  region: RegionType;
  category: ServiceType;
  count: number;
}

export interface NotificationSummaryResult {
  items: NotificationSummaryItem[];
  totalCount: number;
}

export interface ReadNotificationResult {
  id: number;
  isRead: boolean;
}

export interface UpdatedCountResult {
  updatedCount: number;
}

export interface DeletedCountResult {
  deletedCount: number;
  deletedIds: number[];
}

export type { NotificationType };
