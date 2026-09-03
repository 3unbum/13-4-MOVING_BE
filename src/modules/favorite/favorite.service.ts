import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
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
    avgRating: toRating(profile.avgRating),
    reviewCount: profile.reviewCount,
    confirmedCount: profile.confirmedCount,
    favoriteCount: profile.favoriteCount,
    services: row.mover.moverServices.map((item) => item.service),
    regions: row.mover.moverRegions.map((item) => item.region),
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

  async bulkDelete(userId: number, moverIds: number[]) {
    const uniqueMoverIds = [...new Set(moverIds)];
    return favoriteRepository.deleteOwned(userId, uniqueMoverIds);
  },
};
