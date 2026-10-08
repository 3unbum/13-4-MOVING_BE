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

/** 기사님 수신 — "{name} 고객님이 지정 견적 요청을 보냈어요" */
export interface NewRequestPayload {
  customerName: string;
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

/** 고객 수신 — "김코드 기사님이 결제를 요청했어요" */
export interface PaymentRequestPayload {
  moverNickName: string;
  category: ServiceType;
  price: number | null;
}

/** 기사님 수신 — "김민서 고객님이 결제를 완료했어요" */
export interface PaymentCompletedPayload {
  customerName: string;
  category: ServiceType;
  price: number | null;
}

/** 기사님 수신 — "김민서 고객님이 선수금을 결제했어요. 이사가 확정되었어요" */
export interface DepositPaidPayload {
  customerName: string;
  category: ServiceType;
  /** 결제한 선수금 */
  amount: number | null;
}

/** 고객·기사님 수신 — 선수금 기한(48시간)을 넘겨 확정이 자동 취소됐습니다 */
export interface DepositExpiredPayload {
  moverNickName: string;
  customerName: string;
  category: ServiceType;
}

/** 고객 수신 — "김코드 기사님이 추가 금액 N원을 요청했어요" */
export interface ExtraChargeProposedPayload {
  moverNickName: string;
  category: ServiceType;
  amount: number | null;
}

/** 기사님 수신 — "김민서 고객님이 추가 금액을 승인/거절했어요" */
export interface ExtraChargeRespondedPayload {
  customerName: string;
  category: ServiceType;
  amount: number | null;
  approved: boolean;
}

/** 기사님·고객 양쪽 수신. 같은 type이라 문구 분기는 FE가 role로 판단합니다 */
export interface EstimateConfirmedPayload {
  moverNickName: string;
  customerName: string;
  category: ServiceType;
}

/** 고객·기사님 수신 — type으로 전날/당일을 가릅니다 */
export interface MovingDayPayload {
  fromRegion: RegionType;
  toRegion: RegionType;
  fromAddress: string;
  toAddress: string;
  movingDate: Date;
}

/**
 * 고객·기사님 수신 — "{senderName}님이 메시지를 보냈어요".
 * 메시지 내용은 싣지 않습니다. 알림 목록은 계속 화면에 보이고 개인정보가 담길 수 있어서입니다.
 */
export interface ChatMessagePayload {
  roomId: number;
  /** 보낸 사람 — 고객이 받으면 기사님 닉네임(없으면 이름), 기사님이 받으면 고객 이름 */
  senderName: string;
}

interface NotificationBase {
  id: number;
  isRead: boolean;
  createdAt: Date;
  estimateId: number | null;
  quotationRequestId: number | null;
  chatRoomId: number | null;
}

/** type으로 payload가 갈리는 판별 유니온 — FE가 좁히기만 하면 됩니다 */
export type NotificationItem =
  | (NotificationBase & { type: "NEW_REQUEST"; payload: NewRequestPayload })
  | (NotificationBase & { type: "NEW_ESTIMATE"; payload: NewEstimatePayload })
  | (NotificationBase & { type: "ESTIMATE_CONFIRMED"; payload: EstimateConfirmedPayload })
  | (NotificationBase & { type: "MOVING_DAY_BEFORE"; payload: MovingDayPayload })
  | (NotificationBase & { type: "MOVING_DAY"; payload: MovingDayPayload })
  | (NotificationBase & { type: "NEW_CHAT_MESSAGE"; payload: ChatMessagePayload })
  | (NotificationBase & { type: "PAYMENT_REQUEST"; payload: PaymentRequestPayload })
  | (NotificationBase & { type: "PAYMENT_COMPLETED"; payload: PaymentCompletedPayload })
  | (NotificationBase & { type: "DEPOSIT_PAID"; payload: DepositPaidPayload })
  | (NotificationBase & { type: "DEPOSIT_EXPIRED"; payload: DepositExpiredPayload })
  | (NotificationBase & { type: "EXTRA_CHARGE_PROPOSED"; payload: ExtraChargeProposedPayload })
  | (NotificationBase & { type: "EXTRA_CHARGE_RESPONDED"; payload: ExtraChargeRespondedPayload });

export interface NotificationListResult {
  items: NotificationItem[];
  nextCursor: number | null;
  unreadCount: number;
}

/** 오늘 올라온 견적 요청 한 줄 — "경기 지역의 소형이사 견적 3건" */
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
