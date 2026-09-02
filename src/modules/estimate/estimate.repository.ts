import { prisma } from "@/config/prisma";
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
  return prisma.estimate.update({
    where: { quotationRequestId_moverId: { quotationRequestId, moverId } },
    data: {
      comment,
      price: null,
      estimateStatus: "REJECTED",
    },
  });
}
// 기사님 기준 견적 조회
async function getAllByMover({ moverId, cursor, take = 6 }: EstimateGetAllByMoverParams) {
  return prisma.estimate.findMany({
    where: { moverId },
    orderBy: { id: "desc" },
    take,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });
}

// 사용자(이사 견적 요청) 기준 견적 조회
async function getAllByQuotationRequest({
  quotationRequestId,
  estimateStatus,
}: EstimateGetAllByQuotationRequestParams) {
  return prisma.estimate.findMany({
    where: { quotationRequestId, ...(estimateStatus && { estimateStatus }) }, // 서비스 레이어에서 status 값으로 필터링 확정 견적
    orderBy: { id: "desc" },
  });
}

// 견적서 id 로 상세조회
async function getById(id: number) {
  return prisma.estimate.findUnique({ where: { id } });
}

export { getAllByMover, getAllByQuotationRequest, getById, reject, save };
