import { AppError } from "@/common/errors/AppError";
import { ERROR_CODES } from "@/common/errors/errorCodes";
import { favoriteService } from "@/modules/favorite/favorite.service";
import { moverRepository, type MoverListProfile } from "./mover.repository";
import type { MoverListQuery, MoverReviewsQuery } from "./mover.schema";
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
  type MoverReviewItemResponse,
  type MoverReviewsResponse,
} from "./mover.type";

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
    const limit = query.limit ?? 10;
    const decodedCursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const profiles = await moverRepository.findList({
      keyword: query.keyword,
      region: query.region ? (parseRegionLabel(query.region) ?? undefined) : undefined,
      service: query.service ? (parseServiceLabel(query.service) ?? undefined) : undefined,
      sort: query.sort ?? "review",
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
    const [rows, totalCount] = await moverRepository.findConfirmedReviewsByMoverId(
      moverId,
      page,
      limit
    );

    const data: MoverReviewItemResponse[] = rows.map((row) => ({
      id: row.id,
      rating: row.rating ?? 0,
      comment: row.comment ?? "",
      createdAt: row.createdAt.toISOString(),
      customerName: row.customer.name,
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
