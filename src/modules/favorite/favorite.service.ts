import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { REGION_LABELS, SERVICE_LABELS } from "../mover/mover.type";
import { favoriteRepository } from "./favorite.repository";
import type { FavoriteListResult, FavoriteMoverCard } from "./favorite.type";

function toRating(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
}

function toCard(
  row: Awaited<ReturnType<typeof favoriteRepository.findAllByUserId>>[number]
): FavoriteMoverCard | null {
  const profile = row.mover.moverProfile;
  if (!profile) return null;

  return {
    id: row.mover.id,
    nickName: profile.nickName,
    bio: profile.bio,
    image: profile.image,
    career: profile.career,
    avgRating: toRating(profile.avgRating),
    reviewCount: profile.reviewCount,
    confirmedCount: profile.confirmedCount,
    favoriteCount: profile.favoriteCount,
    services: row.mover.moverServices.map((item) => SERVICE_LABELS[item.service]),
    regions: row.mover.moverRegions.map((item) => REGION_LABELS[item.region]),
  };
}

export const favoriteService = {
  async list(userId: number, limit?: number): Promise<FavoriteListResult> {
    const rows = await favoriteRepository.findAllByUserId(userId, limit);
    const items = rows.map(toCard).filter((item): item is FavoriteMoverCard => item !== null);

    return { items, total: items.length };
  },

  async create(userId: number, moverId: number): Promise<FavoriteMoverCard> {
    if (userId === moverId) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, "자기 자신은 찜할 수 없습니다");
    }

    const mover = await favoriteRepository.findMoverForFavorite(moverId);
    if (!mover) {
      throw AppError.notFound("기사님을 찾을 수 없습니다");
    }

    const existing = await favoriteRepository.findOne(userId, moverId);
    if (existing) {
      throw AppError.conflict(ERROR_CODES.ALREADY_FAVORITED, "이미 찜한 기사님입니다");
    }

    const row = await favoriteRepository.createOwned(userId, moverId);
    const card = toCard(row);
    if (!card) {
      throw AppError.notFound("기사님을 찾을 수 없습니다");
    }

    return card;
  },

  async delete(userId: number, moverId: number) {
    const result = await favoriteRepository.deleteOwned(userId, [moverId]);
    if (result.deletedCount === 0) {
      throw AppError.notFound("찜한 기사님이 아닙니다");
    }
    return result;
  },

  /** 여러 기사님을 한 번에 찜합니다. 존재하지 않거나 본인인 id는 제외하고, 이미 찜한 기사님은 skip으로 셉니다 */
  async bulkCreate(userId: number, moverIds: number[]) {
    const uniqueMoverIds = [...new Set(moverIds)].filter((moverId) => moverId !== userId);
    const validMoverIds =
      uniqueMoverIds.length > 0 ? await favoriteRepository.findValidMoverIds(uniqueMoverIds) : [];
    const { createdMoverIds } = await favoriteRepository.createManyOwned(userId, validMoverIds);

    return {
      createdCount: createdMoverIds.length,
      skippedCount: validMoverIds.length - createdMoverIds.length,
    };
  },

  async bulkDelete(userId: number, moverIds: number[]) {
    const uniqueMoverIds = [...new Set(moverIds)];
    return favoriteRepository.deleteOwned(userId, uniqueMoverIds);
  },
};
