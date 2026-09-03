import { prisma } from "@/config/prisma";
import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { createNotification } from "@/modules/notification/notification.service";
import * as repository from "./quotation-request.repository";
import type { QuotationRequestCreateInput } from "./quotation-request.type";

/**
 * 견적 요청 생성.
 *
 * 1. 활성 요청(PENDING·ASSIGNED) 중복 검증 - 유저당 1건
 * 2. 요청 생성과 알림을 한 트랜잭션으로 묶습니다
 */
async function create(input: QuotationRequestCreateInput) {
  const active = await repository.findActiveByUserId(input.userId);
  if (active) {
    throw AppError.conflict(
      ERROR_CODES.ACTIVE_REQUEST_EXISTS,
      "이미 진행 중인 견적 요청이 있습니다."
    );
  }

  return prisma.$transaction(async (tx) => {
    const created = await repository.save(input, tx);

    // 출발지 지역 기사님들에게 NEW_REQUEST 알림
    const moverIds = await repository.findMoverIdsByRegion(input.from.region, tx);
    for (const moverId of moverIds) {
      await createNotification(tx, {
        userId: moverId,
        type: "NEW_REQUEST",
        quotationRequestId: created.id,
      });
    }

    return created;
  });
}

/** 활성 요청 조회. 없으면 null을 반환합니다(에러 아님). */
async function findActive(userId: number) {
  return repository.findActiveByUserId(userId);
}

export { create, findActive };
