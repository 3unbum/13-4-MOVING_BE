import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { favoriteService } from "@/modules/favorite/favorite.service";
import { moverRepository, type MoverListProfile } from "./mover.repository";
import type { MoverListQuery, MoverReviewImagesQuery, MoverReviewsQuery } from "./mover.schema";
import { moverListCursorSchema } from "./mover.schema";
import {
  parseRegionLabel,
  parseServiceLabel,
  REGION_LABELS,
  SERVICE_LABELS,
  type MoverDetailResponse,
  type MoverDetailViewer,
  type MoverListCursor,
  type MoverListItemResponse,
  type MoverListResponse,
  type MoverListSort,
  type MoverRatingDistributionResponse,
  type MoverReviewImageItemResponse,
  type MoverReviewImagesResponse,
  type MoverReviewItemResponse,
  type MoverReviewsResponse,
} from "./mover.type";
import type { RegionType, ServiceType } from "../../../generated/prisma/enums.ts";

/** 커서 인코딩 */
function encodeCursor(profile: MoverListProfile): string {
  const payload: MoverListCursor = {
    profileId: profile.id,
    userId: profile.userId,
    reviewCount: profile.reviewCount,
    avgRating: Number(profile.avgRating),
    career: profile.career,
    confirmedCount: profile.confirmedCount,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/** 커서 디코딩 */
function decodeCursor(cursor: string): MoverListCursor {
  try {
    const json = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return moverListCursorSchema.parse(parsed);
  } catch {
    throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, "유효하지 않은 cursor입니다");
  }
}

/** 기사님 목록을 프론트엔드 응답 스펙(DTO)으로 정제 및 매핑 */
function mapToMoverListItem(profile: MoverListProfile): MoverListItemResponse {
  return {
    id: profile.userId,
    nickName: profile.nickName,
    image: profile.image,
    career: profile.career,
    bio: profile.bio,
    description: profile.description,
    avgRating: Number(profile.avgRating),
    reviewCount: profile.reviewCount,
    confirmedCount: profile.confirmedCount,
    favoriteCount: profile.favoriteCount,
    services: profile.user.moverServices.map(({ service }) => SERVICE_LABELS[service]),
    regions: profile.user.moverRegions.map(({ region }) => REGION_LABELS[region]),
  };
}

/**
 * DB에서 조회한 기사님 상세 정보를 프론트엔드 응답 스펙(DTO)으로 정제 및 매핑
 */
function mapToMoverDetailDTO(
  user: NonNullable<Awaited<ReturnType<typeof moverRepository.findDetailByUserId>>>
): MoverDetailResponse {
  const profile = user.moverProfile!;

  return {
    id: user.id,
    nickName: profile.nickName,
    image: profile.image,
    career: profile.career,
    bio: profile.bio,
    description: profile.description,
    avgRating: Number(profile.avgRating),
    reviewCount: profile.reviewCount,
    confirmedCount: profile.confirmedCount,
    favoriteCount: profile.favoriteCount,
    services: user.moverServices.map(({ service }) => SERVICE_LABELS[service]),
    regions: user.moverRegions.map(({ region }) => REGION_LABELS[region]),
  };
}

export const moverService = {
  async list(query: MoverListQuery): Promise<MoverListResponse> {
    return this.listByFilters({
      keyword: query.keyword,
      region: query.region ? (parseRegionLabel(query.region) ?? undefined) : undefined,
      service: query.service ? (parseServiceLabel(query.service) ?? undefined) : undefined,
      sort: query.sort ?? "review",
      cursor: query.cursor,
      limit: query.limit ?? 10,
    });
  },

  /** AI 찾기 등 — enum 슬롯으로 목록 조회 (한글 라벨 변환 없음) */
  async listByFilters(params: {
    keyword?: string;
    region?: RegionType;
    service?: ServiceType;
    sort: MoverListSort;
    cursor?: string;
    limit: number;
  }): Promise<MoverListResponse> {
    const limit = params.limit;
    const decodedCursor = params.cursor ? decodeCursor(params.cursor) : undefined;

    const profiles = await moverRepository.findList({
      keyword: params.keyword,
      region: params.region,
      service: params.service,
      sort: params.sort,
      cursor: decodedCursor,
      limit,
    });

    const hasNext = profiles.length > limit;
    const page = hasNext ? profiles.slice(0, limit) : profiles;
    const lastProfile = page.length > 0 ? page[page.length - 1] : undefined;

    return {
      data: page.map(mapToMoverListItem),
      nextCursor: hasNext && lastProfile ? encodeCursor(lastProfile) : null,
      hasNext,
    };
  },

  /** 기사님 id 목록 순서를 유지해 목록 카드로 반환합니다 (탈퇴 등으로 없는 id는 제외) */
  async listByIds(moverIds: number[]): Promise<MoverListItemResponse[]> {
    if (moverIds.length === 0) return [];

    const profiles = await moverRepository.findListByUserIds(moverIds);
    const byUserId = new Map(profiles.map((profile) => [profile.userId, profile]));

    return moverIds
      .map((id) => byUserId.get(id))
      .filter((profile): profile is MoverListProfile => profile !== undefined)
      .map(mapToMoverListItem);
  },

  async getById(moverId: number, viewer?: MoverDetailViewer): Promise<MoverDetailResponse> {
    const mover = await moverRepository.findDetailByUserId(moverId);

    if (!mover || mover.role !== "MOVER" || !mover.moverProfile) {
      throw AppError.notFound("기사님을 찾을 수 없습니다");
    }

    const detail = mapToMoverDetailDTO(mover);

    if (viewer?.role !== "CUSTOMER") {
      return detail;
    }

    const [isFavorited, isTargeted] = await Promise.all([
      moverRepository.existsFavorite(viewer.id, moverId),
      moverRepository.isTargetedInActiveRequest(viewer.id, moverId),
    ]);

    return { ...detail, isFavorited, isTargeted };
  },

  async listReviews(moverId: number, query: MoverReviewsQuery): Promise<MoverReviewsResponse> {
    const exists = await moverRepository.existsMover(moverId);
    if (!exists) {
      throw AppError.notFound("기사님을 찾을 수 없습니다");
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const sort = query.sort ?? "latest";
    const [rows, totalCount] = await moverRepository.findConfirmedReviewsByMoverId(
      moverId,
      page,
      limit,
      sort
    );

    const data: MoverReviewItemResponse[] = rows.map((row) => ({
      id: row.id,
      rating: row.rating ?? 0,
      comment: row.comment ?? "",
      createdAt: row.createdAt.toISOString(),
      customerName: row.customer.name,
      imageUrls: row.images.map((image) => image.imageUrl),
    }));

    return {
      data,
      page,
      totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / limit),
      totalCount,
    };
  },

  async getRatingDistribution(moverId: number): Promise<MoverRatingDistributionResponse> {
    const exists = await moverRepository.existsMover(moverId);
    if (!exists) {
      throw AppError.notFound("기사님을 찾을 수 없습니다");
    }

    const rows = await moverRepository.getRatingDistribution(moverId);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalCount = 0;

    for (const row of rows) {
      // CONFIRMED인데 rating이 null인 그룹도 totalCount에는 포함합니다
      totalCount += row._count._all;
      if (
        row.rating === 1 ||
        row.rating === 2 ||
        row.rating === 3 ||
        row.rating === 4 ||
        row.rating === 5
      ) {
        distribution[row.rating] = row._count._all;
      }
    }

    return { ...distribution, totalCount };
  },

  async listReviewImages(
    moverId: number,
    query: MoverReviewImagesQuery
  ): Promise<MoverReviewImagesResponse> {
    const exists = await moverRepository.existsMover(moverId);
    if (!exists) {
      throw AppError.notFound("기사님을 찾을 수 없습니다");
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const [rows, totalCount] = await moverRepository.findConfirmedReviewImagesByMoverId(
      moverId,
      page,
      limit
    );

    const data: MoverReviewImageItemResponse[] = rows.map((row) => ({
      reviewId: row.reviewId,
      imageUrl: row.imageUrl,
    }));

    return {
      data,
      page,
      totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / limit),
      totalCount,
    };
  },

  createFavorite(userId: number, moverId: number) {
    return favoriteService.create(userId, moverId);
  },

  deleteFavorite(userId: number, moverId: number) {
    return favoriteService.delete(userId, moverId);
  },
};
