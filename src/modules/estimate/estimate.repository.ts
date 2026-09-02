import { prisma } from "@/config/prisma";
import { createNotification } from "../notification/notification.service";
import {
  EstimateGetAllByMoverParams,
  EstimateGetAllByQuotationRequestParams,
  EstimateInputField,
  EstimateRejectInput,
} from "./estimate.type";

// 견적 작성 (기사님이 견적 요청에 견적 제시)
async function save(estimate: EstimateInputField) {
  const createEstimate = await prisma.estimate.create({
    data: {
      price: estimate.price,
      comment: estimate.comment,
      quotationRequest: { connect: { id: estimate.quotationRequestId } },
      mover: { connect: { id: estimate.moverId } },
    },
  });
  return createEstimate;
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
  });
}

// 견적서 id 로 상세조회
async function getById(id: number) {
  return prisma.estimate.findUnique({ where: { id } });
}

// 견적 확정(배정) — estimate CONFIRMED, quotationRequest ASSIGNED, mover confirmedCount+1, notification 생성을 한 트랜잭션으로 처리
// COMPLETED는 이사일 경과 후 expireRequests.job.ts가 처리 (여기서 건드리지 않음)
async function confirm(estimateId: number, moverId: number) {
  return prisma.$transaction(async (tx) => {
    const estimate = await tx.estimate.update({
      where: { id: estimateId },
      data: { estimateStatus: "CONFIRMED" },
    });
    await tx.quotationRequest.update({
      where: { id: estimate.quotationRequestId },
      data: { quotationStatus: "ASSIGNED" },
    });
    await tx.moverProfile.update({
      where: { userId: moverId },
      data: { confirmedCount: { increment: 1 } },
    });
    await createNotification(tx, { userId: moverId, estimateId, type: "ESTIMATE_CONFIRMED" });
    return estimate;
  });
}

export default { confirm, getAllByMover, getAllByQuotationRequest, getById, reject, save };
