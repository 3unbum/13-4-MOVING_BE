import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { prisma } from "@/config/prisma";
import type { PrismaTransaction } from "@/config/prisma";
import { Prisma } from "../../../generated/prisma/client";
import type { RegionType } from "../../../generated/prisma/enums";
import type { QuotationRequestCreateInput } from "./quotation-request.type";

const TARGET_LIMIT = 3;
const TARGET_MAX_RETRIES = 3;

/** 활성 요청 = PENDING.ASSIGNED. 유저당 1건만 허용됩니다. */
async function findActiveByUserId(userId: number) {
  return prisma.quotationRequest.findFirst({
    where: {
      userId,
      quotationStatus: { in: ["PENDING", "ASSIGNED"] },
    },
  });
}

/** 견적 요청 생성. 알림과 함께 트랜잭션으로 묶이므로 tx를 받습니다. */
async function save(input: QuotationRequestCreateInput, tx: PrismaTransaction = prisma) {
  return tx.quotationRequest.create({
    data: {
      userId: input.userId,
      category: input.category,
      movingDate: input.movingDate,
      quotationStatus: "PENDING",
      fromPostalCode: input.from.postalCode,
      fromRegion: input.from.region,
      fromAddress: input.from.address,
      fromDetailAddress: input.from.detailAddress,
      toPostalCode: input.to.postalCode,
      toRegion: input.to.region,
      toAddress: input.to.address,
      toDetailAddress: input.to.detailAddress,
    },
  });
}

/** 출발지 지역에서 활동하는 기사님 id 목록 - NEW_REQUEST 알림 대상 */
async function findMoverIdsByRegion(region: RegionType, tx: PrismaTransaction = prisma) {
  const rows = await tx.moverRegion.findMany({
    where: { region },
    select: { moverId: true },
  });
  return rows.map((row) => row.moverId);
}

/** 요청 상세. 지정 기사님 목록을 함께 가져옵니다. */
async function findById(id: number) {
  return prisma.quotationRequest.findUnique({
    where: { id },
    include: {
      targetedRequests: {
        select: {
          moverId: true,
          mover: {
            select: {
              id: true,
              name: true,
              moverProfile: { select: { nickName: true, image: true } },
            },
          },
        },
      },
    },
  });
}

/** 내 요청 이력 (최신순, 페이지네이션) */
async function findManyByUserId(userId: number, page: number, limit: number) {
  return prisma.quotationRequest.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });
}

/** 페이지네이션 총 개수 */
async function countByUserId(userId: number) {
  return prisma.quotationRequest.count({ where: { userId } });
}

/** 지정 대상이 실제 기사님인지 확인 - 없는 id면 FK 오류가 500으로 나갑니다 */
async function findMoverById(moverId: number) {
  return prisma.user.findFirst({
    where: { id: moverId, role: "MOVER" },
    select: { id: true },
  });
}

/**
 * 지정 견적 요청 생성.
 *
 * 3명 상한은 count 후 create라 그냥 두면 동시 요청 시 초과합니다.
 * Serializable로 묶어 원자적으로 처리하고 직렬화 충돌(P2034)은 재시도합니다.
 * (estimate.repository.save와 같은 패턴)
 * 중복 지정은 (quotation_request_id, mover_id) 유니크가 P2002로 막습니다.
 */
async function saveTargetedRequest(
  quotationRequestId: number,
  moverId: number,
  onCreated: (tx: PrismaTransaction, targetedRequestId: number) => Promise<void>
) {
  for (let attempt = 1; attempt <= TARGET_MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // service의 상태 검증은 트랜잭션 밖이라, 그 사이 배치가 요청을 만료시켰을 수 있습니다.
          // Serializable이 순서를 보장하므로 재조회만으로 충분합니다 (FOR UPDATE 불필요.)
          const target = await tx.quotationRequest.findUnique({
            where: { id: quotationRequestId },
            select: { quotationStatus: true },
          });
          if (
            !target ||
            (target.quotationStatus !== "PENDING" && target.quotationStatus !== "ASSIGNED")
          ) {
            throw AppError.badRequest(
              ERROR_CODES.NO_ACTIVE_REQUEST,
              "이미 종료된 견적 요청입니다."
            );
          }

          const count = await tx.targetedRequest.count({ where: { quotationRequestId } });
          if (count >= TARGET_LIMIT) {
            throw AppError.badRequest(
              ERROR_CODES.TARGET_LIMIT_EXCEEDED,
              `지정 견적 요청은 최대 ${TARGET_LIMIT}명까지 가능합니다.`
            );
          }
          const created = await tx.targetedRequest.create({
            data: { quotationRequestId, moverId },
          });
          await onCreated(tx, created.id); // 알림도 같은 트랜잭션
          return created;
        },
        { isolationLevel: "Serializable" }
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw AppError.conflict(ERROR_CODES.ALREADY_TARGETED, "이미 지정한 기사님입니다.");
        }
        if (error.code === "P2034") {
          // 마지막 시도까지 실패하면 raw Prisma 에러가 500으로 나가므로 여기서 변환합니다
          if (attempt < TARGET_MAX_RETRIES) continue;
          throw AppError.conflict(
            ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
            "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
          );
        }
      }
      throw error;
    }
  }

  // for 루프는 위에서 반드시 return하거나 throw하므로 여기 도달하지 않습니다.
  // TypeScript 반환 타입을 만족시키기 위한 방어 코드입니다.
  throw AppError.conflict(
    ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
    "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
  );
}

export {
  countByUserId,
  findActiveByUserId,
  findById,
  findManyByUserId,
  findMoverById,
  findMoverIdsByRegion,
  save,
  saveTargetedRequest,
};
