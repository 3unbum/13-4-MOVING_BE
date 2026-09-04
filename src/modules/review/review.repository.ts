import { prisma } from "../../config/prisma";
import type { PrismaTransaction } from "../../config/prisma";
import { Prisma } from "../../../generated/prisma/client.ts";

const DEFAULT_TAKE = 10;
const CONFIRM_MAX_RETRIES = 3;

const reviewDetailInclude = {
  estimate: {
    select: {
      moverId: true,
      mover: {
        select: {
          moverProfile: {
            select: { nickName: true, image: true },
          },
        },
      },
      quotationRequest: {
        select: {
          movingDate: true,
          fromAddress: true,
          toAddress: true,
          category: true,
        },
      },
    },
  },
} as const;

function listArgs(cursor?: number, take = DEFAULT_TAKE) {
  return {
    take,
    orderBy: { id: "desc" as const },
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  };
}

export const reviewRepository = {
  findWritableByCustomerId(customerId: number, cursor?: number, take?: number) {
    return prisma.review.findMany({
      where: {
        customerId,
        status: "PENDING",
        estimate: { estimateStatus: "COMPLETED", mover: { moverProfile: { isNot: null } } },
      },
      include: reviewDetailInclude,
      ...listArgs(cursor, take),
    });
  },

  findWrittenByCustomerId(customerId: number, cursor?: number, take?: number) {
    return prisma.review.findMany({
      where: {
        customerId,
        status: "CONFIRMED",
        estimate: { mover: { moverProfile: { isNot: null } } },
      },
      include: reviewDetailInclude,
      ...listArgs(cursor, take),
    });
  },

  findReceivedByMoverId(moverId: number, cursor?: number, take?: number) {
    return prisma.review.findMany({
      where: { status: "CONFIRMED", estimate: { moverId } },
      ...listArgs(cursor, take),
    });
  },

  findById(id: number) {
    return prisma.review.findUnique({
      where: { id },
      include: { estimate: { select: { moverId: true, estimateStatus: true } } },
    });
  },

  async confirmOwned(
    reviewId: number,
    customerId: number,
    moverId: number,
    rating: number,
    comment: string
  ) {
    for (let attempt = 1; attempt <= CONFIRM_MAX_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx: PrismaTransaction) => {
            const updated = await tx.review.updateMany({
              where: {
                id: reviewId,
                customerId,
                status: "PENDING",
                estimate: { estimateStatus: "COMPLETED" },
              },
              data: { rating, comment, status: "CONFIRMED" },
            });

            if (updated.count !== 1) {
              return null;
            }

            const stats = await tx.review.aggregate({
              where: { status: "CONFIRMED", estimate: { moverId } },
              _avg: { rating: true },
              _count: { _all: true },
            });

            const avgRating = Math.round((stats._avg.rating ?? 0) * 10) / 10;
            const reviewCount = stats._count._all;

            await tx.moverProfile.update({
              where: { userId: moverId },
              data: {
                avgRating,
                reviewCount: { increment: 1 },
              },
            });

            return { avgRating, reviewCount };
          },
          { isolationLevel: "Serializable" }
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < CONFIRM_MAX_RETRIES
        ) {
          continue;
        }
        throw error;
      }
    }

    return null;
  },
};
