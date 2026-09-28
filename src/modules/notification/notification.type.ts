import type { NotificationType, RegionType, ServiceType } from "../../../generated/prisma/enums.ts";

export type { NotificationType };

export interface CreateNotificationParams {
  userId: number;
  type: NotificationType;
  estimateId?: number;
  quotationRequestId?: number;
  /** @deprecated FE가 type+payload로 문장을 조립합니다. 저장하지 않습니다. */
  message?: string;
}

/** FE가 type별 문장·하이라이트를 조립할 때 쓰는 필드 */
export interface NotificationPayload {
  customerName?: string;
  moverNickName?: string;
  service?: ServiceType;
  fromRegion?: RegionType;
  toRegion?: RegionType;
  fromAddress?: string;
  toAddress?: string;
}

export interface NotificationItem {
  id: number;
  type: NotificationType;
  isRead: boolean;
  createdAt: Date;
  estimateId: number | null;
  quotationRequestId: number | null;
  payload: NotificationPayload;
}

export interface NotificationListResult {
  data: NotificationItem[];
  nextCursor: number | null;
  hasNext: boolean;
}

export interface NotificationReadAllResult {
  updatedCount: number;
}

export interface NotificationDeleteResult {
  deletedCount: number;
  deletedIds: number[];
}

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  estimateId?: number;
  quotationRequestId?: number;
}
