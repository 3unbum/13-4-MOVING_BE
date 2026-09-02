import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { prisma } from "@/config/prisma";
import type { UserRole } from "../../../generated/prisma/enums.ts";
import estimateRepository from "./estimate.repository";
import { estimateListQuery, moverRequestQuery } from "./estimate.type";

async function getMoverEstimates(moverId: number, query: estimateListQuery) {
  return estimateRepository.getAllByMover({
    moverId,
    estimateStatus: query.status,
    cursor: query.cursor,
    take: query.take,
  });
}

async function getQuotationEstimates(
  userId: number, //role 및 userId 검증 필요
  quotationRequestId: number,
  query: estimateListQuery
) {
  const quotationRequest = await prisma.quotationRequest.findUnique({
    where: { id: quotationRequestId },
    select: { userId: true },
  });

  if (!quotationRequest) throw AppError.notFound("요청하신 견적을 찾을 수 없습니다");
  if (quotationRequest.userId !== userId) throw AppError.forbidden();

  return estimateRepository.getAllByQuotationRequest({
    quotationRequestId,
    estimateStatus: query.status,
    cursor: query.cursor,
    take: query.take,
  });
}

// 견적 상세조회 — customer/mover 공용, role별 소유권 검증 본인이 보낸 견적만 조회 가능
async function getById(estimateId: number, userId: number, role: UserRole) {
  const estimate = await estimateRepository.getById(estimateId);
  if (!estimate) throw AppError.notFound("해당 견적을 찾을 수 없습니다");

  if (role === "MOVER") {
    if (estimate.moverId !== userId) throw AppError.forbidden();
    return estimate;
  }

  const quotationRequest = await prisma.quotationRequest.findUnique({
    where: { id: estimate.quotationRequestId },
    select: { userId: true },
  });
  if (quotationRequest?.userId !== userId) throw AppError.forbidden();

  return estimate;
}

// reject/save 공통 — 요청 존재 + 활성(PENDING) 상태 검증
async function getActiveQuotationRequest(quotationRequestId: number) {
  const quotationRequest = await prisma.quotationRequest.findUnique({
    where: { id: quotationRequestId },
    select: { quotationStatus: true },
  });
  if (!quotationRequest) throw AppError.notFound("해당 견적 요청을 찾을 수 없습니다.");
  if (quotationRequest.quotationStatus !== "PENDING") {
    throw AppError.badRequest(ERROR_CODES.NO_ACTIVE_REQUEST, "이미 종료된 요청입니다");
  }
  return quotationRequest;
}

// 견적 반려 — 지정 견적 요청을 받은 mover만 가능
async function reject(quotationRequestId: number, moverId: number, comment: string) {
  await getActiveQuotationRequest(quotationRequestId);

  const targetedRequest = await prisma.targetedRequest.findUnique({
    where: { quotationRequestId_moverId: { quotationRequestId, moverId } },
  });
  if (!targetedRequest) throw AppError.forbidden("지정된 견적 요청이 아닙니다");

  return estimateRepository.reject({ quotationRequestId, moverId, comment });
}

// 견적 제시 — mover만 가능. 지정견적이면 상한 체크 스킵, 일반견적이면 이 요청이 이미 받은 일반견적 5건 상한 체크
async function save(quotationRequestId: number, moverId: number, price: number, comment: string) {
  await getActiveQuotationRequest(quotationRequestId);

  const targetedRequest = await prisma.targetedRequest.findUnique({
    where: { quotationRequestId_moverId: { quotationRequestId, moverId } },
  });

  if (!targetedRequest) {
    const targetedMovers = await prisma.targetedRequest.findMany({
      where: { quotationRequestId },
      select: { moverId: true },
    });
    const generalCount = await prisma.estimate.count({
      where: {
        quotationRequestId,
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

  return estimateRepository.save({ quotationRequestId, moverId, price, comment });
}

// 견적 확정 — customer만 가능. 본인 요청 + 활성 상태 + PENDING 견적일 때만
async function confirm(estimateId: number, userId: number) {
  const estimate = await estimateRepository.getById(estimateId);
  if (!estimate) throw AppError.notFound("해당 견적을 찾을 수 없습니다");
  if (estimate.estimateStatus !== "PENDING") {
    throw AppError.badRequest(ERROR_CODES.ESTIMATE_ALREADY_PROCESSED, "이미 처리된 견적입니다");
  }

  const quotationRequest = await prisma.quotationRequest.findUnique({
    where: { id: estimate.quotationRequestId },
    select: { userId: true, quotationStatus: true },
  });
  if (!quotationRequest) throw AppError.notFound("해당 견적 요청을 찾을 수 없습니다.");
  if (quotationRequest.userId !== userId) throw AppError.forbidden();
  if (quotationRequest.quotationStatus !== "PENDING") {
    throw AppError.badRequest(ERROR_CODES.NO_ACTIVE_REQUEST, "이미 종료된 요청입니다");
  }

  return estimateRepository.confirm(estimateId, estimate.moverId);
}

// mover 받은 요청 목록 — 기본은 전체 최신순, isServiceRegion/isTargeted/category 체크박스로 프론트에서 추가 필터
// 이미 응답(견적/반려)한 건 항상 제외
async function getMoverRequests(moverId: number, query: moverRequestQuery) {
  // 지정받은 시점순은 targetedRequest 기준으로 정렬해야 해서 조회 자체를 다르게 함
  if (query.sort === "targetedAt") {
    const targetedRequests = await prisma.targetedRequest.findMany({
      where: {
        moverId,
        quotationRequest: {
          quotationStatus: "PENDING",
          estimates: { none: { moverId } },
          ...(query.category && { category: query.category }),
        },
      },
      include: { quotationRequest: true },
      orderBy: { createdAt: "asc" },
      take: query.take ?? 6,
      ...(query.cursor && {
        skip: 1,
        cursor: { quotationRequestId_moverId: { quotationRequestId: query.cursor, moverId } },
      }),
    });
    return targetedRequests.map((t) => t.quotationRequest);
  }

  const moverRegions = query.isServiceRegion
    ? await prisma.moverRegion.findMany({ where: { moverId }, select: { region: true } })
    : [];

  return prisma.quotationRequest.findMany({
    where: {
      quotationStatus: "PENDING",
      estimates: { none: { moverId } },
      ...(query.category && { category: query.category }),
      ...(query.isServiceRegion && { fromRegion: { in: moverRegions.map((r) => r.region) } }),
      ...(query.isTargeted && { targetedRequests: { some: { moverId } } }),
    },
    orderBy: query.sort === "movingDate" ? { movingDate: "asc" } : { id: "desc" },
    take: query.take ?? 6,
    ...(query.cursor && { skip: 1, cursor: { id: query.cursor } }),
  });
}

export {
  confirm,
  getById,
  getMoverEstimates,
  getMoverRequests,
  getQuotationEstimates,
  reject,
  save,
};
