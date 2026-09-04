import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { reviewRepository } from "./review.repository";
import type { ConfirmReviewDto, ReviewListQuery } from "./review.schema";
import type {
  ConfirmReviewResult,
  ReceivedReviewItem,
  ReviewListResult,
  ReviewMovingInfo,
  ReviewMoverSummary,
  WritableReviewItem,
  WrittenReviewItem,
} from "./review.type";

const DEFAULT_TAKE = 10;

function toMover(
  moverId: number,
  profile: { nickName: string; image: string | null } | null
): ReviewMoverSummary | null {
  if (!profile) return null;
  return { id: moverId, nickName: profile.nickName, image: profile.image };
}

function toMoving(request: {
  movingDate: Date;
  fromAddress: string;
  toAddress: string;
  category: string;
}): ReviewMovingInfo {
  return {
    movingDate: request.movingDate,
    fromAddress: request.fromAddress,
    toAddress: request.toAddress,
    category: request.category,
  };
}

function paginate<T extends { id: number }>(rows: T[], take: number): ReviewListResult<T> {
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}

type DetailRow = Awaited<ReturnType<typeof reviewRepository.findWritableByCustomerId>>[number];

function toWritable(row: DetailRow): WritableReviewItem | null {
  const mover = toMover(row.estimate.moverId, row.estimate.mover.moverProfile);
  if (!mover) return null;
  return { id: row.id, mover, moving: toMoving(row.estimate.quotationRequest) };
}

function toWritten(row: DetailRow): WrittenReviewItem | null {
  const mover = toMover(row.estimate.moverId, row.estimate.mover.moverProfile);
  if (!mover || row.rating == null || row.comment == null) return null;
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    mover,
    moving: toMoving(row.estimate.quotationRequest),
    createdAt: row.createdAt,
  };
}

export const reviewService = {
  async listWritable(
    customerId: number,
    query: ReviewListQuery
  ): Promise<ReviewListResult<WritableReviewItem>> {
    const take = query.take ?? DEFAULT_TAKE;
    const rows = await reviewRepository.findWritableByCustomerId(
      customerId,
      query.cursor,
      take + 1
    );
    const items = rows.map(toWritable).filter((item): item is WritableReviewItem => item !== null);
    return paginate(items, take);
  },

  async listWritten(
    customerId: number,
    query: ReviewListQuery
  ): Promise<ReviewListResult<WrittenReviewItem>> {
    const take = query.take ?? DEFAULT_TAKE;
    const rows = await reviewRepository.findWrittenByCustomerId(customerId, query.cursor, take + 1);
    const items = rows.map(toWritten).filter((item): item is WrittenReviewItem => item !== null);
    return paginate(items, take);
  },

  async listReceived(
    moverId: number,
    query: ReviewListQuery
  ): Promise<ReviewListResult<ReceivedReviewItem>> {
    const take = query.take ?? DEFAULT_TAKE;
    const rows = await reviewRepository.findReceivedByMoverId(moverId, query.cursor, take + 1);
    const items = rows.map((row) => ({
      id: row.id,
      rating: row.rating ?? 0,
      comment: row.comment ?? "",
      createdAt: row.createdAt,
    }));
    return paginate(items, take);
  },

  async confirm(
    customerId: number,
    reviewId: number,
    dto: ConfirmReviewDto
  ): Promise<ConfirmReviewResult> {
    const review = await reviewRepository.findById(reviewId);
    if (!review) {
      throw AppError.notFound("리뷰를 찾을 수 없습니다");
    }
    if (review.customerId !== customerId) {
      throw AppError.forbidden("본인 리뷰만 작성할 수 있습니다");
    }
    if (review.status === "CONFIRMED") {
      throw AppError.conflict(ERROR_CODES.REVIEW_ALREADY_CONFIRMED, "이미 작성한 리뷰입니다");
    }
    if (review.estimate.estimateStatus !== "COMPLETED") {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_ERROR,
        "이사 완료 후에만 리뷰를 작성할 수 있습니다"
      );
    }

    const stats = await reviewRepository.confirmOwned(
      reviewId,
      customerId,
      review.estimate.moverId,
      dto.rating,
      dto.comment
    );

    if (!stats) {
      throw AppError.conflict(ERROR_CODES.REVIEW_ALREADY_CONFIRMED, "이미 작성한 리뷰입니다");
    }

    return {
      id: reviewId,
      rating: dto.rating,
      comment: dto.comment,
      avgRating: stats.avgRating,
      reviewCount: stats.reviewCount,
    };
  },
};
