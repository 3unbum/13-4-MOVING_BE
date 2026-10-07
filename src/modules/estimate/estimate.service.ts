import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { prisma } from "@/config/prisma";
import { getExpireBaseDate } from "@/jobs/expireRequests.util";
import type { EstimateStatus, UserRole } from "../../../generated/prisma/enums.ts";
import {
  toEstimateListResponse,
  toEstimateResponse,
  toMoverRequestListResponse,
} from "./estimate.dto";
import estimateRepository, { moverRequestInclude } from "./estimate.repository";
import {
  paymentEstimateListQuery,
  estimateListQuery,
  estimatePayInput,
  extraChargeProposeInput,
  extraChargeRespondInput,
  moverRequestQuery,
} from "./estimate.type";
import { calcBalanceAmount, calcExtraChargeMax, toPaymentStage } from "./estimate.payment";
import { confirmTossPayment, toPaymentOrderId } from "./toss-payments";

async function getMoverEstimates(moverId: number, query: paymentEstimateListQuery) {
  const estimates = await estimateRepository.getAllByMover({
    moverId,
    estimateStatus: query.status,
    paymentStage: query.paymentStage,
    sort: query.sort,
    month: query.month,
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

/// "대기 중인 견적" 탭이 보여줄 상태.
///
/// 반려(REJECTED)를 함께 내려줍니다. 요청이 아직 살아있는 동안 고객이 보는 화면은
/// 이 목록뿐이라, PENDING 만 주면 반려한 기사님이 조용히 사라집니다.
/// "받았던 견적"은 요청이 PENDING 이 아니게 된 뒤에야 열려서 그때는 이미 늦습니다.
const PENDING_TAB_STATUSES: EstimateStatus[] = ["PENDING", "REJECTED"];

// 대기 중인 견적 (#26) — quotationRequestId 없이, 유저의 활성 요청부터 찾아서 조회
async function getPendingEstimates(userId: number, query: estimateListQuery) {
  const activeRequest = await prisma.quotationRequest.findFirst({
    where: { userId, quotationStatus: { in: ["PENDING", "ASSIGNED"] } },
    select: { id: true },
  });
  if (!activeRequest) return [];

  const estimates = await estimateRepository.getAllByQuotationRequest({
    quotationRequestId: activeRequest.id,
    estimateStatus: query.status ?? PENDING_TAB_STATUSES,
    cursor: query.cursor,
    take: query.take,
  });

  return toEstimateListResponse(estimates);
}

// 내 견적 목록 (#140) — 요청과 무관하게 고객이 받은 견적 전체. paymentStage로 탭을 가른다
// (대기 중인 결제 = 선수금 대기 + 잔금 대기, 결제 내역 = 잔금까지 결제 완료)
async function getCustomerEstimates(userId: number, query: paymentEstimateListQuery) {
  const estimates = await estimateRepository.getAllByCustomer({
    userId,
    estimateStatus: query.status,
    paymentStage: query.paymentStage,
    sort: query.sort,
    month: query.month,
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

  // 실시간 신호는 repository.save가 커밋에 성공한 뒤에만 보냅니다
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

  // 실시간 신호는 repository.confirm이 커밋에 성공한 뒤에만 보냅니다
  return estimateRepository.confirm(estimateId, estimate.moverId);
}

// 견적 결제 — customer만 가능. 선수금(확정 후 48시간 안)과 잔금(이사 완료 후)을 종류(type)로 가른다.
// 금액·주문 번호는 서버가 종류별로 계산해 클라이언트 값과 대조한다 (토스 테스트 키면 실제 청구 없음).
async function pay(estimateId: number, userId: number, input: estimatePayInput) {
  const estimate = await estimateRepository.getById(estimateId);
  if (!estimate) throw AppError.notFound("해당 견적을 찾을 수 없습니다");

  const quotationRequest = await prisma.quotationRequest.findUnique({
    where: { id: estimate.quotationRequestId },
    select: { userId: true },
  });
  if (quotationRequest?.userId !== userId) throw AppError.forbidden();

  let expectedAmount: number;

  if (input.type === "DEPOSIT") {
    // 선수금은 확정됐고 선수금이 설정된 견적만 낼 수 있다
    if (estimate.estimateStatus !== "CONFIRMED" || estimate.depositAmount === null) {
      throw AppError.badRequest(
        ERROR_CODES.DEPOSIT_NOT_REQUIRED,
        "선수금을 결제할 수 있는 견적이 아닙니다"
      );
    }
    if (estimate.depositPaidAt) {
      throw AppError.conflict(ERROR_CODES.ALREADY_PAID, "이미 선수금을 결제한 견적입니다");
    }
    if (estimate.depositDueAt && estimate.depositDueAt.getTime() < Date.now()) {
      throw AppError.badRequest(ERROR_CODES.DEPOSIT_EXPIRED, "선수금 결제 기한이 지났습니다");
    }
    expectedAmount = estimate.depositAmount;
  } else {
    if (estimate.paymentStatus === "PAID") {
      throw AppError.conflict(ERROR_CODES.ALREADY_PAID, "이미 결제한 견적입니다");
    }
    if (estimate.estimateStatus !== "COMPLETED") {
      throw AppError.badRequest(
        ERROR_CODES.ESTIMATE_NOT_COMPLETED,
        "이사가 완료된 견적만 결제할 수 있습니다"
      );
    }
    // 기사님이 추가 금액을 요청했는데 고객이 아직 응답하지 않았다면 잔금이 정해지지 않은 상태다 —
    // 이대로 결제하면 요청을 무시하는 셈이라 먼저 응답하게 한다
    if (estimate.extraCharges.some((c) => c.status === "PROPOSED")) {
      throw AppError.badRequest(
        ERROR_CODES.EXTRA_CHARGE_PENDING,
        "추가 금액 요청에 먼저 응답해 주세요"
      );
    }
    // 선수금이 있는 견적은 선수금부터 내야 잔금을 낼 수 있다 (옛 견적은 선수금이 없어 통과)
    if (toPaymentStage(estimate) !== "BALANCE_DUE") {
      throw AppError.badRequest(ERROR_CODES.DEPOSIT_NOT_PAID, "선수금을 먼저 결제해 주세요");
    }
    expectedAmount = calcBalanceAmount(estimate);
  }

  // 금액·주문 번호는 클라이언트가 보낸 값이라 서버 기준과 맞는지 먼저 확인한다 (승인 전에 걸러야 청구가 안 된다)
  if (
    input.amount !== expectedAmount ||
    input.orderId !== toPaymentOrderId(estimateId, input.type)
  ) {
    throw AppError.badRequest(
      ERROR_CODES.PAYMENT_FAILED,
      "결제 금액 또는 주문 정보가 견적과 일치하지 않습니다"
    );
  }

  await confirmTossPayment(input);

  // 위 검증과 갱신 사이에 다른 요청이 먼저 결제했을 수 있어 조건부 갱신 결과를 다시 확인한다
  const paid =
    input.type === "DEPOSIT"
      ? await estimateRepository.payDeposit(estimateId, input.paymentKey)
      : await estimateRepository.pay(estimateId, input.paymentKey);
  if (!paid) throw AppError.conflict(ERROR_CODES.ALREADY_PAID, "이미 결제한 견적입니다");

  const updated = await estimateRepository.getById(estimateId);
  return toEstimateResponse(updated!);
}

// 추가 금액 요청 — mover만 가능. 본인이 보낸 견적이 잔금 대기(이사 완료 후, 아직 미결제)일 때 여러 건 보낼 수 있다.
// 건마다 사유가 필수이고, 거절되지 않은 건의 합계가 견적 금액의 20% 이내여야 한다. 고객이 승인한 건만 잔금에 합산된다.
async function proposeExtraCharge(
  estimateId: number,
  moverId: number,
  input: extraChargeProposeInput
) {
  const estimate = await getOwnBalanceDueEstimate(estimateId, moverId, "요청");
  const max = calcExtraChargeMax(estimate.price);

  if (input.amount > max) {
    throw AppError.badRequest(
      ERROR_CODES.EXTRA_CHARGE_TOO_LARGE,
      "추가 금액은 견적 금액의 20%를 넘을 수 없습니다"
    );
  }

  // 합계 상한은 동시 요청에도 어긋나지 않도록 repository가 트랜잭션 안에서 다시 검사한다
  await estimateRepository.proposeExtraCharge(estimateId, input, max);

  const updated = await estimateRepository.getById(estimateId);
  return toEstimateResponse(updated!);
}

// 추가 금액 수정 — mover만 가능. 아직 고객이 응답하지 않은(PROPOSED) 본인 요청의 금액·사유만 고칠 수 있다.
async function updateExtraCharge(
  estimateId: number,
  chargeId: number,
  moverId: number,
  input: extraChargeProposeInput
) {
  const estimate = await getOwnBalanceDueEstimate(estimateId, moverId, "수정");
  const max = calcExtraChargeMax(estimate.price);

  if (input.amount > max) {
    throw AppError.badRequest(
      ERROR_CODES.EXTRA_CHARGE_TOO_LARGE,
      "추가 금액은 견적 금액의 20%를 넘을 수 없습니다"
    );
  }

  await estimateRepository.updateExtraCharge(estimateId, chargeId, input, max);

  const updated = await estimateRepository.getById(estimateId);
  return toEstimateResponse(updated!);
}

// 본인이 보낸 견적이 잔금 대기 단계인지 확인한다 (추가 금액 요청·수정 공통)
async function getOwnBalanceDueEstimate(estimateId: number, moverId: number, action: string) {
  const estimate = await estimateRepository.getById(estimateId);
  if (!estimate) throw AppError.notFound("해당 견적을 찾을 수 없습니다");
  if (estimate.moverId !== moverId) throw AppError.forbidden();

  const stage = toPaymentStage(estimate);
  if (stage === "PAID") {
    throw AppError.conflict(
      ERROR_CODES.ALREADY_PAID,
      `이미 결제가 끝난 견적에는 추가 금액을 ${action}할 수 없습니다`
    );
  }
  if (stage !== "BALANCE_DUE") {
    throw AppError.badRequest(
      ERROR_CODES.ESTIMATE_NOT_COMPLETED,
      `이사가 완료된 견적에만 추가 금액을 ${action}할 수 있습니다`
    );
  }
  return estimate;
}

// 추가 금액 응답 — customer만 가능. 고른 건이 모두 응답 대기일 때 한 번에 승인(잔금에 합산)하거나 거절(잔금 그대로)한다.
async function respondExtraCharge(
  estimateId: number,
  userId: number,
  input: extraChargeRespondInput
) {
  const estimate = await estimateRepository.getById(estimateId);
  if (!estimate) throw AppError.notFound("해당 견적을 찾을 수 없습니다");

  const quotationRequest = await prisma.quotationRequest.findUnique({
    where: { id: estimate.quotationRequestId },
    select: { userId: true },
  });
  if (quotationRequest?.userId !== userId) throw AppError.forbidden();

  const chargeIds = [...new Set(input.chargeIds)];
  const pendingIds = new Set(
    estimate.extraCharges.filter((c) => c.status === "PROPOSED").map((c) => c.id)
  );
  if (!chargeIds.every((id) => pendingIds.has(id))) {
    throw AppError.badRequest(
      ERROR_CODES.EXTRA_CHARGE_NOT_PENDING,
      "응답할 추가 금액 요청이 없습니다"
    );
  }

  await estimateRepository.respondExtraCharges(
    estimateId,
    chargeIds,
    input.decision === "APPROVE" ? "APPROVED" : "REJECTED"
  );

  const updated = await estimateRepository.getById(estimateId);
  return toEstimateResponse(updated!);
}

// 결제 요청 — mover만 가능. 본인이 보낸 견적이 선수금 대기 또는 잔금 대기일 때, 단계마다 1번만.
// 고객에게 결제 요청 알림이 간다. 알림 생성과 중복 방지는 repository.requestPayment가 한 트랜잭션으로 처리한다.
async function requestPayment(estimateId: number, moverId: number) {
  const estimate = await estimateRepository.getById(estimateId);
  if (!estimate) throw AppError.notFound("해당 견적을 찾을 수 없습니다");
  if (estimate.moverId !== moverId) throw AppError.forbidden();

  const stage = toPaymentStage(estimate);
  if (stage === "PAID") {
    throw AppError.conflict(ERROR_CODES.ALREADY_PAID, "이미 결제한 견적입니다");
  }
  // 선수금 대기(확정 후) 또는 잔금 대기(이사 완료 후)일 때만 결제를 요청할 수 있다
  if (stage === "NONE") {
    throw AppError.badRequest(
      ERROR_CODES.ESTIMATE_NOT_COMPLETED,
      "결제를 요청할 수 있는 단계의 견적이 아닙니다"
    );
  }
  if (estimate.paymentRequestedAt) {
    throw AppError.conflict(
      ERROR_CODES.PAYMENT_REQUEST_ALREADY_SENT,
      "이미 결제를 요청한 견적입니다"
    );
  }

  await estimateRepository.requestPayment(estimateId);

  const updated = await estimateRepository.getById(estimateId);
  return toEstimateResponse(updated!);
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
  getCustomerEstimates,
  getMoverEstimates,
  getMoverRequests,
  getPendingEstimates,
  getQuotationEstimates,
  pay,
  proposeExtraCharge,
  reject,
  requestPayment,
  respondExtraCharge,
  updateExtraCharge,
  save,
};
