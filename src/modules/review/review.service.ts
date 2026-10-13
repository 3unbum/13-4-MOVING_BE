import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { detectImageType } from "../../common/utils/fileSignature.util";
import { MAX_REVIEW_IMAGES } from "./review.constants";
import { reviewRepository } from "./review.repository";
import { uploadReviewImage } from "./review.storage";
import type { ConfirmReviewDto, ReviewListQuery } from "./review.schema";
import type {
  ConfirmReviewResult,
  ReceivedReviewItem,
  ReviewImageUploadResult,
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

const IMAGE_LIMIT_MESSAGE = `리뷰 사진은 최대 ${MAX_REVIEW_IMAGES}장까지 첨부할 수 있습니다`;
const UNSUPPORTED_IMAGE_MESSAGE = "지원하지 않는 이미지 형식입니다. (jpeg, png, webp만 가능)";

function toImageUrls(images: { imageUrl: string }[]): string[] {
  return images.map((image) => image.imageUrl);
}

/** 작성 전(PENDING)과 작성 후(CONFIRMED) 모두 본인만 고칠 수 있다. */
async function requireEditableOwned(customerId: number, reviewId: number) {
  const review = await reviewRepository.findById(reviewId);
  if (!review) {
    throw AppError.notFound("리뷰를 찾을 수 없습니다");
  }
  if (review.customerId !== customerId) {
    throw AppError.forbidden("본인 리뷰만 수정할 수 있습니다");
  }
  if (review.status !== "PENDING" && review.status !== "CONFIRMED") {
    throw AppError.conflict(ERROR_CODES.REVIEW_ALREADY_CONFIRMED, "수정할 수 없는 리뷰입니다");
  }
  return review;
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
  return {
    id: row.id,
    mover,
    moving: toMoving(row.estimate.quotationRequest),
    imageUrls: toImageUrls(row.images),
  };
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
    editedAt: row.editedAt,
    imageUrls: toImageUrls(row.images),
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
      imageUrls: toImageUrls(row.images),
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
    if (review.estimate.estimateStatus !== "COMPLETED") {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_ERROR,
        "이사 완료 후에만 리뷰를 작성할 수 있습니다"
      );
    }

    // 이미 작성한 리뷰는 건수를 올리지 않고 별점·내용만 바꾼다.
    if (review.status === "CONFIRMED") {
      const stats = await reviewRepository.updateOwned(
        reviewId,
        customerId,
        review.estimate.moverId,
        dto.rating,
        dto.comment
      );
      if (!stats) {
        throw AppError.conflict(ERROR_CODES.REVIEW_ALREADY_CONFIRMED, "수정할 수 없는 리뷰입니다");
      }
      return {
        id: reviewId,
        rating: dto.rating,
        comment: dto.comment,
        avgRating: stats.avgRating,
        reviewCount: stats.reviewCount,
      };
    }

    // 처음 작성하는 리뷰는 결제를 마친 뒤에만 쓸 수 있다 (이미 작성한 리뷰의 수정은 위에서 처리)
    if (review.estimate.paymentStatus !== "PAID") {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_ERROR,
        "결제를 완료한 뒤에 리뷰를 작성할 수 있습니다"
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

  async addImage(
    customerId: number,
    reviewId: number,
    file: Buffer | undefined
  ): Promise<ReviewImageUploadResult> {
    await requireEditableOwned(customerId, reviewId);
    if (!file) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, "이미지 파일이 필요합니다.");
    }

    // 클라이언트가 보낸 mimetype/파일명은 신뢰하지 않고 실제 바이트로 형식을 재검증합니다.
    const detected = detectImageType(file);
    if (!detected) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, UNSUPPORTED_IMAGE_MESSAGE);
    }

    const count = await reviewRepository.countImages(reviewId);
    if (count >= MAX_REVIEW_IMAGES) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, IMAGE_LIMIT_MESSAGE);
    }

    const imageUrl = await uploadReviewImage(reviewId, file, detected);
    const created = await reviewRepository.createImage(reviewId, customerId, imageUrl);
    if (created.status === "not_pending") {
      throw AppError.conflict(ERROR_CODES.REVIEW_ALREADY_CONFIRMED, "수정할 수 없는 리뷰입니다");
    }
    if (created.status === "limit") {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, IMAGE_LIMIT_MESSAGE);
    }

    return { imageUrl: created.imageUrl };
  },

  async removeImage(customerId: number, reviewId: number, imageUrl: string): Promise<void> {
    await requireEditableOwned(customerId, reviewId);
    const deleted = await reviewRepository.deleteImage(reviewId, customerId, imageUrl);
    if (deleted.status === "not_pending") {
      throw AppError.conflict(ERROR_CODES.REVIEW_ALREADY_CONFIRMED, "수정할 수 없는 리뷰입니다");
    }
    if (deleted.status === "missing") {
      throw AppError.notFound("리뷰 사진을 찾을 수 없습니다");
    }
  },
};
