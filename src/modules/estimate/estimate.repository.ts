import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { prisma } from "@/config/prisma";
import { Prisma } from "../../../generated/prisma/client.ts";
import { createNotification } from "../notification/notification.service";
import {
  EstimateGetAllByMoverParams,
  EstimateGetAllByQuotationRequestParams,
  EstimateInputField,
  EstimateRejectInput,
} from "./estimate.type";

const SAVE_MAX_RETRIES = 3;

/// 견적 응답에 기사님 정보를 싣기 위한 공통 include.
///
/// FE 견적 카드가 이름·평점·경력·찜수까지 한 번에 필요한데 estimate 컬럼만으로는 채울 수 없고,
/// moverId로 /movers/:id를 견적 수만큼 부르면 N+1이 됩니다. 정렬용 반정규화 컬럼
/// (avgRating·reviewCount·confirmedCount·favoriteCount)이 이미 moverProfile에 있어
/// 추가 집계 없이 조인 한 번으로 끝납니다.
///
/// password 등이 새어나가지 않도록 user는 select로 필요한 필드만 뽑습니다.
/// 받은 요청(기사님) 조회용 include.
///
/// 카드에 "OOO 고객님"이 들어가는데 응답에 userId만 있어 이름을 채울 수 없었습니다.
/// user를 통째로 넣으면 password·refreshToken까지 나가므로 select로 이름만 뽑습니다.
///
/// `targetedRequests`는 **조회한 기사님 본인의 지정 여부**만 확인하면 되므로
/// moverId로 걸러 최대 1건만 가져옵니다. 전체를 가져오면 다른 기사님이 지정됐다는
/// 사실까지 응답에 실립니다. 반려는 지정 견적 요청에만 허용되고(estimate.service)
/// 카드·모달의 "지정 견적 요청" 칩도 이 값으로 그립니다.
export const moverRequestInclude = (moverId: number) =>
  ({
    user: { select: { name: true } },
    targetedRequests: { where: { moverId }, select: { id: true }, take: 1 },
  }) as const;

export const estimateInclude = {
  mover: {
    select: {
      id: true,
      name: true,
      moverProfile: {
        select: {
          image: true,
          nickName: true,
          career: true,
          bio: true,
          avgRating: true,
          reviewCount: true,
          confirmedCount: true,
          favoriteCount: true,
        },
      },
    },
  },
  /// 지정 견적 여부 판별용 — estimate.is_targeted 플래그는 8/28에 미채택이라 조인으로 봅니다.
  /// 요청에 달린 지정 목록에 이 견적의 기사님이 있으면 지정 견적입니다.
  quotationRequest: {
    select: {
      id: true,
      category: true,
      movingDate: true,
      createdAt: true,
      targetedRequests: { select: { moverId: true } },
    },
  },
} satisfies Prisma.EstimateInclude;

// 견적 작성 (기사님이 견적 요청에 견적 제시) — 일반견적 5건 상한 체크를 Serializable 트랜잭션으로 원자적 처리
// isTargeted=false일 때만 상한 체크. 직렬화 충돌(P2034)은 재시도, 중복 제출(P2002)은 ALREADY_ESTIMATED로 변환
async function save(estimate: EstimateInputField, isTargeted: boolean) {
  for (let attempt = 1; attempt <= SAVE_MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          if (!isTargeted) {
            const targetedMovers = await tx.targetedRequest.findMany({
              where: { quotationRequestId: estimate.quotationRequestId },
              select: { moverId: true },
            });
            const generalCount = await tx.estimate.count({
              where: {
                quotationRequestId: estimate.quotationRequestId,
                moverId: { notIn: targetedMovers.map((t) => t.moverId) },
              },
            });
            if (generalCount >= 5) {
              throw AppError.badRequest(
                ERROR_CODES.ESTIMATE_LIMIT_EXCEEDED,
                "이 견적 요청에 이미 일반 견적이 5건 도착했습니다"
              );
            }
          }

          return tx.estimate.create({
            data: {
              price: estimate.price,
              comment: estimate.comment,
              quotationRequest: { connect: { id: estimate.quotationRequestId } },
              mover: { connect: { id: estimate.moverId } },
            },
          });
        },
        { isolationLevel: "Serializable" }
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw AppError.conflict(
            ERROR_CODES.ALREADY_ESTIMATED,
            "이미 이 요청에 견적을 보내셨습니다"
          );
        }
        if (error.code === "P2034" && attempt < SAVE_MAX_RETRIES) {
          continue; // 직렬화 충돌 — 재시도
        }
      }
      throw error;
    }
  }
  throw AppError.conflict(
    ERROR_CODES.ESTIMATE_LIMIT_EXCEEDED,
    "요청이 몰려 처리하지 못했습니다. 다시 시도해주세요."
  );
}

// 사용자가 요청한 지정 견적 요청에 대한 반려
async function reject({ quotationRequestId, moverId, comment }: EstimateRejectInput) {
  return prisma.estimate.upsert({
    where: { quotationRequestId_moverId: { quotationRequestId, moverId } },
    create: {
      comment,
      price: null,
      estimateStatus: "REJECTED",
      quotationRequest: { connect: { id: quotationRequestId } },
      mover: { connect: { id: moverId } },
    },
    update: {
      comment,
      price: null,
      estimateStatus: "REJECTED",
    },
  });
}
// 기사님 기준 견적 조회
async function getAllByMover({
  moverId,
  estimateStatus,
  cursor,
  take = 6,
}: EstimateGetAllByMoverParams) {
  return prisma.estimate.findMany({
    where: { moverId, ...(estimateStatus && { estimateStatus }) },
    orderBy: { id: "desc" },
    take,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    include: estimateInclude,
  });
}

// 사용자(이사 견적 요청) 기준 견적 조회
async function getAllByQuotationRequest({
  quotationRequestId,
  estimateStatus,
  cursor,
  take = 4,
}: EstimateGetAllByQuotationRequestParams) {
  return prisma.estimate.findMany({
    where: { quotationRequestId, ...(estimateStatus && { estimateStatus }) }, // 서비스 레이어에서 status 값으로 필터링 확정 견적
    orderBy: { id: "desc" },
    take,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    include: estimateInclude,
  });
}

// 견적서 id 로 상세조회
async function getById(id: number) {
  return prisma.estimate.findUnique({ where: { id }, include: estimateInclude });
}

// 견적 확정(배정) — estimate CONFIRMED, quotationRequest ASSIGNED, mover confirmedCount+1, notification 생성을 한 트랜잭션으로 처리
// COMPLETED는 이사일 경과 후 expireRequests.job.ts가 처리 (여기서 건드리지 않음)
async function confirm(estimateId: number, moverId: number) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.estimate.findUnique({
      where: { id: estimateId },
      select: { quotationRequestId: true },
    });
    if (!existing) throw AppError.notFound("해당 견적을 찾을 수 없습니다");

    // PENDING 조건부 갱신 — 동시에 두 번 확정 시도해도 하나만 성공하도록 (count로 검증)
    const estimateUpdate = await tx.estimate.updateMany({
      where: { id: estimateId, estimateStatus: "PENDING" },
      data: { estimateStatus: "CONFIRMED" },
    });
    if (estimateUpdate.count !== 1) {
      throw AppError.badRequest(ERROR_CODES.ESTIMATE_ALREADY_PROCESSED, "이미 처리된 견적입니다");
    }

    // 같은 요청의 다른 견적이 먼저 확정됐을 수 있으므로 여기도 PENDING 조건부 갱신
    const requestUpdate = await tx.quotationRequest.updateMany({
      where: { id: existing.quotationRequestId, quotationStatus: "PENDING" },
      data: { quotationStatus: "ASSIGNED" },
    });
    if (requestUpdate.count !== 1) {
      throw AppError.badRequest(ERROR_CODES.NO_ACTIVE_REQUEST, "이미 종료된 요청입니다");
    }

    await tx.moverProfile.update({
      where: { userId: moverId },
      data: { confirmedCount: { increment: 1 } },
    });
    await createNotification(tx, { userId: moverId, estimateId, type: "ESTIMATE_CONFIRMED" });

    return tx.estimate.findUniqueOrThrow({ where: { id: estimateId } });
  });
}

export default { confirm, getAllByMover, getAllByQuotationRequest, getById, reject, save };
