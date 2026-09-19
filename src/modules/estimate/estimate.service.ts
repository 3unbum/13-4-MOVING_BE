import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { prisma } from "@/config/prisma";
import { getExpireBaseDate } from "@/jobs/expireRequests.util";
import type { UserRole } from "../../../generated/prisma/enums.ts";
import {
  toEstimateListResponse,
  toEstimateResponse,
  toMoverRequestListResponse,
} from "./estimate.dto";
import estimateRepository, { moverRequestInclude } from "./estimate.repository";
import { estimateListQuery, moverRequestQuery } from "./estimate.type";

async function getMoverEstimates(moverId: number, query: estimateListQuery) {
  const estimates = await estimateRepository.getAllByMover({
    moverId,
    estimateStatus: query.status,
    cursor: query.cursor,
    take: query.take,
  });

  return toEstimateListResponse(estimates);
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

  const estimates = await estimateRepository.getAllByQuotationRequest({
    quotationRequestId,
    estimateStatus: query.status,
    cursor: query.cursor,
    take: query.take,
  });

  return toEstimateListResponse(estimates);
}

// 대기 중인 견적 (#26) — quotationRequestId 없이, 유저의 활성 요청부터 찾아서 PENDING 견적만 조회
async function getPendingEstimates(userId: number, query: estimateListQuery) {
  const activeRequest = await prisma.quotationRequest.findFirst({
    where: { userId, quotationStatus: { in: ["PENDING", "ASSIGNED"] } },
    select: { id: true },
  });
  if (!activeRequest) return [];

  const estimates = await estimateRepository.getAllByQuotationRequest({
    quotationRequestId: activeRequest.id,
    estimateStatus: query.status ?? "PENDING",
    cursor: query.cursor,
    take: query.take,
  });

  return toEstimateListResponse(estimates);
}

// 견적 상세조회 — customer/mover 공용, role별 소유권 검증 본인이 보낸 견적만 조회 가능
async function getById(estimateId: number, userId: number, role: UserRole) {
  const estimate = await estimateRepository.getById(estimateId);
  if (!estimate) throw AppError.notFound("해당 견적을 찾을 수 없습니다");

  if (role === "MOVER") {
    if (estimate.moverId !== userId) throw AppError.forbidden();
    return toEstimateResponse(estimate);
  }

  const quotationRequest = await prisma.quotationRequest.findUnique({
    where: { id: estimate.quotationRequestId },
    select: { userId: true },
  });
  if (quotationRequest?.userId !== userId) throw AppError.forbidden();

  return toEstimateResponse(estimate);
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
// 상한 체크 + 실제 저장은 repository.save 안에서 트랜잭션으로 원자적 처리 (동시 제출 레이스 방지)
async function save(quotationRequestId: number, moverId: number, price: number, comment: string) {
  await getActiveQuotationRequest(quotationRequestId);

  const targetedRequest = await prisma.targetedRequest.findUnique({
    where: { quotationRequestId_moverId: { quotationRequestId, moverId } },
  });

  return estimateRepository.save(
    { quotationRequestId, moverId, price, comment },
    Boolean(targetedRequest)
  );
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
  const moverRegions = query.isServiceRegion
    ? await prisma.moverRegion.findMany({ where: { moverId }, select: { region: true } })
    : [];

  // 고객 이름 부분 검색 — 기사님 찾기(mover.repository)의 keyword와 같은 방식입니다
  const searchWhere = query.search
    ? { user: { name: { contains: query.search, mode: "insensitive" as const } } }
    : {};

  // 두 조회 경로(아래 targetedAt 분기 / 일반)가 갈라지지 않도록 공통 조건은 한 곳에 둡니다.
  // 한쪽만 고치면 정렬을 바꿨을 때 결과 기준이 달라집니다.
  const requestWhere = {
    quotationStatus: "PENDING" as const,
    estimates: { none: { moverId } },
    // 이사 당일·경과 요청은 지금 견적을 보내도 의미가 없습니다. 요청 생성부터
    // "내일 이후"만 허용하므로(quotation-request.schema.ts) 목록도 같은 기준을 씁니다.
    // 배치가 밀려 PENDING으로 남은 경과 건도 여기서 함께 빠집니다. (1차 QA-15)
    movingDate: { gt: getExpireBaseDate() },
    ...(query.category && { category: { in: query.category } }),
    ...(query.isServiceRegion && { fromRegion: { in: moverRegions.map((r) => r.region) } }),
    ...searchWhere,
  };

  // 지정받은 시점순은 targetedRequest 기준으로 정렬해야 해서 조회 자체를 다르게 함
  if (query.sort === "targetedAt") {
    const targetedRequests = await prisma.targetedRequest.findMany({
      where: {
        moverId,
        quotationRequest: requestWhere,
      },
      include: { quotationRequest: { include: moverRequestInclude(moverId) } },
      orderBy: { createdAt: "asc" },
      take: query.take ?? 6,
      ...(query.cursor && {
        skip: 1,
        cursor: { quotationRequestId_moverId: { quotationRequestId: query.cursor, moverId } },
      }),
    });
    return toMoverRequestListResponse(targetedRequests.map((t) => t.quotationRequest));
  }

  const requests = await prisma.quotationRequest.findMany({
    where: {
      ...requestWhere,
      ...(query.isTargeted && { targetedRequests: { some: { moverId } } }),
    },
    include: moverRequestInclude(moverId),
    orderBy: query.sort === "movingDate" ? { movingDate: "asc" } : { id: "desc" },
    take: query.take ?? 6,
    ...(query.cursor && { skip: 1, cursor: { id: query.cursor } }),
  });

  return toMoverRequestListResponse(requests);
}

export {
  confirm,
  getById,
  getMoverEstimates,
  getMoverRequests,
  getPendingEstimates,
  getQuotationEstimates,
  reject,
  save,
};
