/**
 * 알림 DB row → API/SSE 응답(`NotificationItem`) 변환.
 *
 * ## 목적
 * BE는 완성된 한글 문장을 만들지 않습니다.
 * FE가 type별 템플릿으로 문장·하이라이트·상대시간을 조립할 수 있도록
 * 재료(`payload`)만 정리해서 내려줍니다.
 *
 * ## 의도
 * - repository: Prisma 조회만 (include 모양은 여기서 정의)
 * - mapper: 조회 결과를 FE 계약 형태로 평탄화
 * - service: 비즈니스 판단 / SSE 발행. payload 조립 규칙은 여기로 모읍니다
 */

import type { Prisma } from "../../../generated/prisma/client.ts";
import type { NotificationType, RegionType, ServiceType } from "../../../generated/prisma/enums.ts";
import type { NotificationItem, NotificationPayload } from "./notification.type";

export const notificationDetailInclude = {
  estimate: {
    select: {
      mover: {
        select: {
          name: true,
          moverProfile: { select: { nickName: true } },
        },
      },
      quotationRequest: {
        select: {
          category: true,
          fromRegion: true,
          toRegion: true,
          fromAddress: true,
          toAddress: true,
          user: { select: { name: true } },
        },
      },
    },
  },
  quotationRequest: {
    select: {
      category: true,
      fromRegion: true,
      toRegion: true,
      fromAddress: true,
      toAddress: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.NotificationInclude;

export type NotificationDetailRow = Prisma.NotificationGetPayload<{
  include: typeof notificationDetailInclude;
}>;

/** 견적 요청에서 payload로 뽑는 공통 필드 */
type RequestFields = {
  category: ServiceType;
  fromRegion: RegionType;
  toRegion: RegionType;
  fromAddress: string;
  toAddress: string;
  user: { name: string };
};

/**
 * 견적 요청 정보 → payload 공통 조각.
 * 주소 짧은 표기
 */
function requestPayload(request: RequestFields): NotificationPayload {
  return {
    customerName: request.user.name,
    service: request.category,
    fromRegion: request.fromRegion,
    toRegion: request.toRegion,
    fromAddress: request.fromAddress,
    toAddress: request.toAddress,
  };
}

/**
 * Prisma row → REST/SSE에 실을 `NotificationItem`.
 *
 * 관계가 비어 있으면 payload는 `{}`입니다.
 */
export function toNotificationItem(row: NotificationDetailRow): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    isRead: row.isRead,
    createdAt: row.createdAt,
    estimateId: row.estimateId,
    quotationRequestId: row.quotationRequestId,
    payload: buildPayload(row),
  };
}

/**
 * type별 payload 필드 선택.
 *
 * | type | 주로 쓰는 필드 |
 * | --- | --- |
 * | NEW_REQUEST | customerName, service, 출발/도착 |
 * | NEW_ESTIMATE | moverNickName, service, … |
 * | ESTIMATE_CONFIRMED | moverNickName, customerName, service, … |
 * | MOVING_DAY | service, 출발/도착 (당일 리마인드) |
 *
 * service / region은 enum 그대로 둡니다. 한글 라벨은 FE 맵을 사용합니다.
 */
function buildPayload(row: NotificationDetailRow): NotificationPayload {
  switch (row.type as NotificationType) {
    case "NEW_REQUEST":
      return row.quotationRequest ? requestPayload(row.quotationRequest) : {};
    case "NEW_ESTIMATE":
    case "ESTIMATE_CONFIRMED": {
      if (!row.estimate) return {};
      const request = row.estimate.quotationRequest;
      return {
        ...requestPayload(request),
        moverNickName: row.estimate.mover.moverProfile?.nickName ?? row.estimate.mover.name,
      };
    }
    case "MOVING_DAY":
      return row.quotationRequest ? requestPayload(row.quotationRequest) : {};
    default:
      return {};
  }
}
