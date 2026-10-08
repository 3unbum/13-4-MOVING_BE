import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { prisma } from "../../config/prisma";
import type { PrismaTransaction } from "../../config/prisma";
import { Prisma } from "../../../generated/prisma/client.ts";
import { MAX_REVIEW_IMAGES } from "./review.constants";

const DEFAULT_TAKE = 10;
const CONFIRM_MAX_RETRIES = 3;

const reviewImagesSelect = {
  orderBy: { sortOrder: "asc" as const },
  select: { imageUrl: true },
} as const;

const reviewDetailInclude = {
  images: reviewImagesSelect,
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

async function runSerializable<T>(work: (tx: PrismaTransaction) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= CONFIRM_MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        if (attempt < CONFIRM_MAX_RETRIES) continue;
        throw AppError.conflict(
          ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
          "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
        );
      }
      throw error;
    }
  }

  throw AppError.conflict(
    ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
    "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
  );
}

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
      include: { images: reviewImagesSelect },
      ...listArgs(cursor, take),
    });
  },

  findById(id: number) {
    return prisma.review.findUnique({
      where: { id },
      include: { estimate: { select: { moverId: true, estimateStatus: true } } },
    });
  },

  countImages(reviewId: number) {
    return prisma.reviewImage.count({ where: { reviewId } });
  },

  /**
   * 본인 리뷰(작성 전·후)에만 사진을 붙입니다.
   * 조회와 저장 사이에 3장이 채워질 수 있어 트랜잭션에서 다시 확인합니다.
   */
  createImage(reviewId: number, customerId: number, imageUrl: string) {
    return runSerializable(async (tx) => {
      const owned = await tx.review.findFirst({
        where: { id: reviewId, customerId, status: { in: ["PENDING", "CONFIRMED"] } },
        select: { id: true },
      });
      if (!owned) return { status: "not_pending" as const };

      const count = await tx.reviewImage.count({ where: { reviewId } });
      if (count >= MAX_REVIEW_IMAGES) return { status: "limit" as const };

      const max = await tx.reviewImage.aggregate({
        where: { reviewId },
        _max: { sortOrder: true },
      });
      const sortOrder = (max._max.sortOrder ?? -1) + 1;
      const created = await tx.reviewImage.create({
        data: { reviewId, imageUrl, sortOrder },
        select: { imageUrl: true },
      });
      await tx.review.updateMany({
        where: { id: reviewId, status: "CONFIRMED" },
        data: { editedAt: new Date() },
      });
      return { status: "ok" as const, imageUrl: created.imageUrl };
    });
  },

  /** 본인 리뷰(작성 전·후)에 달린 URL만 지웁니다. */
  deleteImage(reviewId: number, customerId: number, imageUrl: string) {
    return runSerializable(async (tx) => {
      const owned = await tx.review.findFirst({
        where: { id: reviewId, customerId, status: { in: ["PENDING", "CONFIRMED"] } },
        select: { id: true },
      });
      if (!owned) return { status: "not_pending" as const };

      const deleted = await tx.reviewImage.deleteMany({ where: { reviewId, imageUrl } });
      if (deleted.count === 0) return { status: "missing" as const };
      await tx.review.updateMany({
        where: { id: reviewId, status: "CONFIRMED" },
        data: { editedAt: new Date() },
      });
      return { status: "ok" as const };
    });
  },

  /** 확정된 리뷰의 별점·내용만 바꾼다. 리뷰 건수는 올리지 않는다. */
  async updateOwned(
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
              where: { id: reviewId, customerId, status: "CONFIRMED" },
              data: { rating, comment, editedAt: new Date() },
            });
            if (updated.count !== 1) return null;

            const stats = await tx.review.aggregate({
              where: { status: "CONFIRMED", estimate: { moverId } },
              _avg: { rating: true },
              _count: { _all: true },
            });
            const avgRating = Math.round((stats._avg.rating ?? 0) * 10) / 10;

            await tx.moverProfile.update({
              where: { userId: moverId },
              data: { avgRating },
            });

            return { avgRating, reviewCount: stats._count._all };
          },
          { isolationLevel: "Serializable" }
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          if (attempt < CONFIRM_MAX_RETRIES) continue;
          throw AppError.conflict(
            ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
            "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
          );
        }
        throw error;
      }
    }

    throw AppError.conflict(
      ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
      "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
    );
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
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          // 마지막 시도까지 실패하면 raw Prisma 에러가 500으로 나가므로 여기서 변환합니다
          if (attempt < CONFIRM_MAX_RETRIES) continue;
          throw AppError.conflict(
            ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
            "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
          );
        }
        throw error;
      }
    }

    throw AppError.conflict(
      ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
      "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
    );
  },
};
