import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { prisma } from "@/config/prisma";
import { Prisma } from "../../../generated/prisma/client.ts";
import { createManyNotifications, createNotification } from "../notification/notification.service";
import {
  enqueueNotificationPublish,
  runAfterCommitPublish,
} from "../notification/notification.publish";
import {
  balanceDueWhere,
  calcDepositAmount,
  calcDepositDueAt,
  depositDueWhere,
  kstMonthRange,
  monthRange,
  paymentStageWhere,
  type PaymentStageFilter,
} from "./estimate.payment";
import {
  EstimateGetAllByCustomerParams,
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
  /// 추가 금액 요청 목록(오래된 순) — 잔금 계산과 고객·기사님 화면이 씁니다
  extraCharges: { orderBy: { id: "asc" } },
  /// 지정 견적 여부 판별용 — estimate.is_targeted 플래그는 8/28에 미채택이라 조인으로 봅니다.
  /// 요청에 달린 지정 목록에 이 견적의 기사님이 있으면 지정 견적입니다.
  ///
  /// 고객 이름과 주소는 "내 견적 관리"(#88) 카드·상세가 씁니다.
  /// 카드에 "OOO 고객님"과 출발지·도착지가 들어가는데 id·category·movingDate만으로는
  /// 채울 수 없었습니다. user는 password 등이 새어나가지 않도록 select로 이름만 뽑습니다.
  ///
  /// 상세 주소(동·호수)와 우편번호는 **기사님이 실제로 이사를 가려면 필요한 정보**인데
  /// 도로명까지만 내려가고 있었습니다. 같은 기사님 화면인데도 "받은 요청"(moverRequestInclude)은
  /// 전체 컬럼을 주고 여기만 잘려서, 견적을 보낸 뒤 오히려 정보가 줄어드는 상태였습니다.
  quotationRequest: {
    select: {
      id: true,
      category: true,
      movingDate: true,
      createdAt: true,
      fromPostalCode: true,
      fromAddress: true,
      fromDetailAddress: true,
      toPostalCode: true,
      toAddress: true,
      toDetailAddress: true,
      targetedRequests: { select: { moverId: true } },
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.EstimateInclude;

// 견적 작성 (기사님이 견적 요청에 견적 제시) — 일반견적 5건 상한 체크를 Serializable 트랜잭션으로 원자적 처리
// isTargeted=false일 때만 상한 체크. 직렬화 충돌(P2034)은 재시도, 중복 제출(P2002)은 ALREADY_ESTIMATED로 변환
async function save(estimate: EstimateInputField, isTargeted: boolean) {
  for (let attempt = 1; attempt <= SAVE_MAX_RETRIES; attempt++) {
    try {
      return await runAfterCommitPublish(() =>
        prisma.$transaction(
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

            const created = await tx.estimate.create({
              data: {
                price: estimate.price,
                comment: estimate.comment,
                quotationRequest: { connect: { id: estimate.quotationRequestId } },
                mover: { connect: { id: estimate.moverId } },
              },
            });

            // 견적을 요청한 고객에게 알립니다. 요청자 조회도 트랜잭션 안에서 해야
            // 상한 검증과 같은 스냅샷을 봅니다.
            const request = await tx.quotationRequest.findUniqueOrThrow({
              where: { id: estimate.quotationRequestId },
              select: { userId: true },
            });
            await createNotification(tx, {
              userId: request.userId,
              estimateId: created.id,
              type: "NEW_ESTIMATE",
            });
            enqueueNotificationPublish([request.userId], "NEW_ESTIMATE");

            return created;
          },
          { isolationLevel: "Serializable" }
        )
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
/**
 * 결제 탭 목록의 정렬·월별 조회 — 카드에 보이는 날짜 기준입니다.
 * 결제 내역(PAID)은 결제일(`paidAt`, KST 월), 대기 중인 결제는 이사 완료일(= 이사일).
 * 같은 날은 id로 가려 순서가 흔들리지 않게 하고, 커서는 id 그대로라 어느 방향이든
 * skip:1 + cursor로 다음 페이지가 이어집니다.
 */
function payListArgs(
  paymentStage: PaymentStageFilter | undefined,
  sort: "latest" | "oldest",
  month: string | undefined
) {
  const isHistory = paymentStage === "PAID";
  const direction = sort === "oldest" ? "asc" : "desc";

  const monthWhere: Prisma.EstimateWhereInput = month
    ? isHistory
      ? { paidAt: kstMonthRange(month) }
      : { quotationRequest: { movingDate: monthRange(month) } }
    : {};
  const orderBy: Prisma.EstimateOrderByWithRelationInput[] = [
    isHistory ? { paidAt: direction } : { quotationRequest: { movingDate: direction } },
    { id: direction },
  ];

  return { monthWhere, orderBy };
}

// 기사님 기준 견적 조회
async function getAllByMover({
  moverId,
  estimateStatus,
  paymentStage,
  sort = "latest",
  month,
  cursor,
  take = 6,
}: EstimateGetAllByMoverParams) {
  const { monthWhere, orderBy } = payListArgs(paymentStage, sort, month);

  return prisma.estimate.findMany({
    where: {
      moverId,
      ...(estimateStatus && { estimateStatus }),
      ...(paymentStage && paymentStageWhere(paymentStage)),
      ...monthWhere,
    },
    orderBy,
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
    // 서비스 레이어에서 status 값으로 필터링. 배열이면 여러 상태를 한 번에 봅니다.
    where: {
      quotationRequestId,
      ...(estimateStatus && {
        estimateStatus: Array.isArray(estimateStatus) ? { in: estimateStatus } : estimateStatus,
      }),
    },
    orderBy: { id: "desc" },
    take,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    include: estimateInclude,
  });
}

// 고객 기준 견적 조회 — 요청 단위가 아니라 고객이 받은 견적 전체 (결제 탭용)
async function getAllByCustomer({
  userId,
  estimateStatus,
  paymentStage,
  sort = "latest",
  month,
  cursor,
  take = 6,
}: EstimateGetAllByCustomerParams) {
  const { monthWhere, orderBy } = payListArgs(paymentStage, sort, month);

  return prisma.estimate.findMany({
    where: {
      quotationRequest: { userId },
      ...(estimateStatus && { estimateStatus }),
      ...(paymentStage && paymentStageWhere(paymentStage)),
      // 이사일 조건이 quotationRequest를 덮어쓰지 않도록 AND로 겹칩니다
      ...(month && { AND: [monthWhere] }),
    },
    orderBy,
    take,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    include: estimateInclude,
  });
}

// 견적서 id 로 상세조회
async function getById(id: number) {
  return prisma.estimate.findUnique({ where: { id }, include: estimateInclude });
}

// 견적 확정(배정) — estimate CONFIRMED + 선수금 설정, quotationRequest ASSIGNED, mover confirmedCount+1, notification 생성을 한 트랜잭션으로 처리
// 고객·기사님 1:1 채팅방도 이때 열립니다. 선수금을 기한 안에 못 내면 expireDeposits가 확정을 취소하면서 방을 지웁니다.
// COMPLETED는 이사일 경과 후 expireRequests.job.ts가 처리 (여기서 건드리지 않음)
async function confirm(estimateId: number, moverId: number) {
  return runAfterCommitPublish(() =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.estimate.findUnique({
        where: { id: estimateId },
        // 확정 알림은 고객도 받으므로 요청자 id를 함께 읽습니다. 선수금은 견적가와 이사일로 정합니다
        select: {
          price: true,
          quotationRequestId: true,
          quotationRequest: { select: { userId: true, movingDate: true } },
        },
      });
      if (!existing) throw AppError.notFound("해당 견적을 찾을 수 없습니다");

      // PENDING 조건부 갱신 — 동시에 두 번 확정 시도해도 하나만 성공하도록 (count로 검증)
      const estimateUpdate = await tx.estimate.updateMany({
        where: { id: estimateId, estimateStatus: "PENDING" },
        data: {
          estimateStatus: "CONFIRMED",
          depositAmount: calcDepositAmount(existing.price ?? 0),
          depositDueAt: calcDepositDueAt(new Date(), existing.quotationRequest.movingDate),
        },
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
      // 확정된 고객·기사님 1:1 채팅방 (estimateId unique) — 선수금을 내기 전에도 대화할 수 있게 확정 즉시 엽니다
      await tx.chatRoom.create({
        data: {
          estimateId,
          customerId: existing.quotationRequest.userId,
          moverId,
        },
      });
      // 확정은 기사님·고객 양쪽이 받습니다. 같은 type이라 문구 분기는 FE가 자기 role로 처리합니다
      await createManyNotifications(tx, [
        { userId: moverId, estimateId, type: "ESTIMATE_CONFIRMED" },
        { userId: existing.quotationRequest.userId, estimateId, type: "ESTIMATE_CONFIRMED" },
      ]);
      enqueueNotificationPublish([moverId, existing.quotationRequest.userId], "ESTIMATE_CONFIRMED");

      return tx.estimate.findUniqueOrThrow({ where: { id: estimateId } });
    })
  );
}

// 선수금 결제 기록 — 선수금 대기 단계(CONFIRMED + 선수금 설정 + 미결제)이고 기한 안일 때만 기록한다.
// 같은 트랜잭션에서 기사님에게 알린다 (채팅방은 확정할 때 이미 열려 있다).
// 기사님이 보낸 결제 요청은 선수금을 냈으니 지운다 — 잔금 때 한 번 더 보낼 수 있게.
async function payDeposit(estimateId: number, paymentKey: string) {
  return runAfterCommitPublish(() =>
    prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.estimate.updateMany({
        where: { id: estimateId, ...depositDueWhere, depositDueAt: { gte: now } },
        data: { depositPaidAt: now, depositPaymentKey: paymentKey, paymentRequestedAt: null },
      });
      if (count !== 1) return false;

      const { moverId } = await tx.estimate.findUniqueOrThrow({
        where: { id: estimateId },
        select: { moverId: true },
      });
      await createNotification(tx, { userId: moverId, estimateId, type: "DEPOSIT_PAID" });
      enqueueNotificationPublish([moverId], "DEPOSIT_PAID");

      return true;
    })
  );
}

// 잔금 결제 기록 — 잔금 대기 단계(COMPLETED + UNPAID, 선수금을 냈거나 선수금 없는 옛 견적)일 때만 PAID로 바꾸고, 견적을 보낸 기사님에게 알린다.
// 조건부 갱신이라 동시에 두 번 눌러도 하나만 성공한다(confirm과 같은 패턴). 성공 여부를 돌려준다.
// 결제하면 고객이 쓸 수 있는 리뷰(PENDING)도 같이 만든다. 상태 갱신·리뷰·알림 생성은 한 트랜잭션이고, SSE는 커밋 뒤에만 나간다.
async function pay(estimateId: number, paymentKey: string) {
  return runAfterCommitPublish(() =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.estimate.updateMany({
        where: { id: estimateId, ...balanceDueWhere },
        data: { paymentStatus: "PAID", paidAt: new Date(), paymentKey },
      });
      if (count !== 1) return false;

      const { moverId, quotationRequest } = await tx.estimate.findUniqueOrThrow({
        where: { id: estimateId },
        select: { moverId: true, quotationRequest: { select: { userId: true } } },
      });
      // 작성 가능한 리뷰는 잔금을 결제하면 열립니다. 이미 있으면(예전 방식으로 만들어진 행) 그대로 둡니다
      await tx.review.upsert({
        where: { estimateId },
        create: { estimateId, customerId: quotationRequest.userId, status: "PENDING" },
        update: {},
      });
      await createNotification(tx, { userId: moverId, estimateId, type: "PAYMENT_COMPLETED" });
      enqueueNotificationPublish([moverId], "PAYMENT_COMPLETED");

      return true;
    })
  );
}

// 추가 금액 요청 — 잔금 대기(이사 완료 + 잔금 미결제) 단계일 때 한 건을 추가하고 고객에게 알린다. 견적당 여러 건 가능.
// 견적 행을 먼저 갱신해 잠그므로(조건부 updateMany) 동시에 보내도 상한 검사가 서로 어긋나지 않는다.
async function proposeExtraCharge(
  estimateId: number,
  input: { amount: number; reason: string },
  maxTotal: number
) {
  return runAfterCommitPublish(() =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.estimate.updateMany({
        where: { id: estimateId, ...balanceDueWhere },
        data: { updatedAt: new Date() },
      });
      if (count !== 1) {
        throw AppError.badRequest(
          ERROR_CODES.ESTIMATE_NOT_COMPLETED,
          "추가 금액을 요청할 수 있는 단계가 아닙니다"
        );
      }

      const existing = await tx.estimateExtraCharge.aggregate({
        where: { estimateId, status: { in: ["PROPOSED", "APPROVED"] } },
        _sum: { amount: true },
      });
      if ((existing._sum.amount ?? 0) + input.amount > maxTotal) {
        throw AppError.badRequest(
          ERROR_CODES.EXTRA_CHARGE_TOO_LARGE,
          "추가 금액 합계는 견적 금액의 20%를 넘을 수 없습니다"
        );
      }

      await tx.estimateExtraCharge.create({
        data: { estimateId, amount: input.amount, reason: input.reason },
      });

      const { quotationRequest } = await tx.estimate.findUniqueOrThrow({
        where: { id: estimateId },
        select: { quotationRequest: { select: { userId: true } } },
      });
      const customerId = quotationRequest.userId;
      await createNotification(tx, {
        userId: customerId,
        estimateId,
        type: "EXTRA_CHARGE_PROPOSED",
      });
      enqueueNotificationPublish([customerId], "EXTRA_CHARGE_PROPOSED");
    })
  );
}

// 추가 금액 수정 — 아직 응답 대기(PROPOSED)인 건만, 잔금 대기 단계에서 금액·사유를 고친다. 고객에게 알림은 다시 보내지 않는다.
// 상한은 이 건을 뺀 나머지 합계 기준으로 다시 검사한다.
async function updateExtraCharge(
  estimateId: number,
  chargeId: number,
  input: { amount: number; reason: string },
  maxTotal: number
) {
  return prisma.$transaction(async (tx) => {
    const { count: locked } = await tx.estimate.updateMany({
      where: { id: estimateId, ...balanceDueWhere },
      data: { updatedAt: new Date() },
    });
    if (locked !== 1) {
      throw AppError.badRequest(
        ERROR_CODES.ESTIMATE_NOT_COMPLETED,
        "추가 금액을 수정할 수 있는 단계가 아닙니다"
      );
    }

    const others = await tx.estimateExtraCharge.aggregate({
      where: { estimateId, id: { not: chargeId }, status: { in: ["PROPOSED", "APPROVED"] } },
      _sum: { amount: true },
    });
    if ((others._sum.amount ?? 0) + input.amount > maxTotal) {
      throw AppError.badRequest(
        ERROR_CODES.EXTRA_CHARGE_TOO_LARGE,
        "추가 금액 합계는 견적 금액의 20%를 넘을 수 없습니다"
      );
    }

    const { count } = await tx.estimateExtraCharge.updateMany({
      where: { id: chargeId, estimateId, status: "PROPOSED" },
      data: { amount: input.amount, reason: input.reason },
    });
    if (count !== 1) {
      throw AppError.badRequest(
        ERROR_CODES.EXTRA_CHARGE_NOT_PENDING,
        "응답 대기 중인 추가 금액 요청만 수정할 수 있습니다"
      );
    }
  });
}

// 추가 금액 승인·거절 — 고른 건(chargeIds) 전부가 응답 대기(PROPOSED)이고 잔금 대기 단계일 때만 한 번에 바꾸고, 기사님에게 알린다(알림은 1건).
// 승인한 건은 잔금(calcBalanceAmount)에 합산된다. 거절한 건은 기록으로 남고 잔금은 그대로다.
async function respondExtraCharges(
  estimateId: number,
  chargeIds: number[],
  status: "APPROVED" | "REJECTED"
) {
  return runAfterCommitPublish(() =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.estimateExtraCharge.updateMany({
        where: {
          id: { in: chargeIds },
          estimateId,
          status: "PROPOSED",
          estimate: balanceDueWhere,
        },
        data: { status, respondedAt: new Date() },
      });
      if (count !== chargeIds.length) {
        // 일부만 바뀌었으면 롤백해 "전부 아니면 전무"로 맞춘다
        throw AppError.badRequest(
          ERROR_CODES.EXTRA_CHARGE_NOT_PENDING,
          "응답할 추가 금액 요청이 없습니다"
        );
      }

      const { moverId } = await tx.estimate.findUniqueOrThrow({
        where: { id: estimateId },
        select: { moverId: true },
      });
      await createNotification(tx, { userId: moverId, estimateId, type: "EXTRA_CHARGE_RESPONDED" });
      enqueueNotificationPublish([moverId], "EXTRA_CHARGE_RESPONDED");
    })
  );
}

// 결제 요청 — 선수금 대기 또는 잔금 대기 단계이고 아직 요청 안 한 견적에 한 번만(선수금을 내면 초기화돼 잔금 때 다시 보낼 수 있다). 시각 기록과 고객 알림을 한 트랜잭션으로 처리한다.
// 조건부 갱신이라 동시에 두 번 눌러도 하나만 성공한다(confirm과 같은 패턴).
async function requestPayment(estimateId: number) {
  return runAfterCommitPublish(() =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.estimate.findUnique({
        where: { id: estimateId },
        select: { quotationRequest: { select: { userId: true } } },
      });
      if (!existing) throw AppError.notFound("해당 견적을 찾을 수 없습니다");

      const { count } = await tx.estimate.updateMany({
        where: {
          id: estimateId,
          paymentRequestedAt: null,
          OR: [depositDueWhere, balanceDueWhere],
        },
        data: { paymentRequestedAt: new Date() },
      });
      if (count !== 1) {
        throw AppError.conflict(
          ERROR_CODES.PAYMENT_REQUEST_ALREADY_SENT,
          "이미 결제를 요청한 견적입니다"
        );
      }

      const customerId = existing.quotationRequest.userId;
      await createNotification(tx, { userId: customerId, estimateId, type: "PAYMENT_REQUEST" });
      enqueueNotificationPublish([customerId], "PAYMENT_REQUEST");
    })
  );
}

export default {
  confirm,
  getAllByCustomer,
  getAllByMover,
  getAllByQuotationRequest,
  getById,
  pay,
  payDeposit,
  proposeExtraCharge,
  reject,
  requestPayment,
  respondExtraCharges,
  save,
  updateExtraCharge,
};
