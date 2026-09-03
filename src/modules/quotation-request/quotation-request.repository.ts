import { prisma } from "@/config/prisma";
import type { PrismaTransaction } from "@/config/prisma";
import type { RegionType } from "../../../generated/prisma/enums";
import type { QuotationRequestCreateInput } from "./quotation-request.type";

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

export { findActiveByUserId, findMoverIdsByRegion, save };
