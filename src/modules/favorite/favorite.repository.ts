import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { prisma } from "../../config/prisma";
import type { PrismaTransaction } from "../../config/prisma";
import { Prisma } from "../../../generated/prisma/client.ts";

const moverCardInclude = {
  mover: {
    select: {
      id: true,
      moverProfile: {
        select: {
          nickName: true,
          bio: true,
          image: true,
          career: true,
          avgRating: true,
          reviewCount: true,
          confirmedCount: true,
          favoriteCount: true,
        },
      },
      moverServices: { select: { service: true } },
      moverRegions: { select: { region: true } },
    },
  },
} as const;

export const favoriteRepository = {
  findAllByUserId(userId: number, take?: number) {
    return prisma.favorite.findMany({
      where: { userId, mover: { moverProfile: { isNot: null } } },
      include: moverCardInclude,
      orderBy: { createdAt: "desc" },
      ...(take !== undefined && { take }),
    });
  },

  findMoverForFavorite(moverId: number) {
    return prisma.user.findFirst({
      where: { id: moverId, role: "MOVER", moverProfile: { isNot: null } },
      select: { id: true },
    });
  },

  findOne(userId: number, moverId: number) {
    return prisma.favorite.findUnique({
      where: { userId_moverId: { userId, moverId } },
    });
  },

  incrementFavoriteCount(moverId: number, tx: PrismaTransaction = prisma) {
    return tx.moverProfile.update({
      where: { userId: moverId },
      data: { favoriteCount: { increment: 1 } },
    });
  },

  create(userId: number, moverId: number, tx: PrismaTransaction = prisma) {
    return tx.favorite.create({
      data: { userId, moverId },
      include: moverCardInclude,
    });
  },

  async createOwned(userId: number, moverId: number) {
    try {
      return await prisma.$transaction(async (tx) => {
        await favoriteRepository.incrementFavoriteCount(moverId, tx);
        return favoriteRepository.create(userId, moverId, tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw AppError.conflict(ERROR_CODES.ALREADY_FAVORITED, "이미 찜한 기사님입니다");
      }
      throw error;
    }
  },

  findValidMoverIds(moverIds: number[]) {
    return prisma.user
      .findMany({
        where: { id: { in: moverIds }, role: "MOVER", moverProfile: { isNot: null } },
        select: { id: true },
      })
      .then((rows) => rows.map((row) => row.id));
  },

  incrementFavoriteCounts(moverIds: number[], tx: PrismaTransaction = prisma) {
    return tx.moverProfile.updateMany({
      where: { userId: { in: moverIds } },
      data: { favoriteCount: { increment: 1 } },
    });
  },

  /** 이미 찜한 기사님은 건너뛰고, 실제로 추가된 기사님만 favoriteCount를 올립니다 */
  async createManyOwned(userId: number, moverIds: number[]) {
    if (moverIds.length === 0) {
      return { createdMoverIds: [] as number[] };
    }

    return prisma.$transaction(async (tx) => {
      const values = moverIds.map((moverId) => Prisma.sql`(${userId}, ${moverId}, NOW())`);
      const inserted = await tx.$queryRaw<{ mover_id: number }[]>`
        INSERT INTO favorite (user_id, mover_id, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (user_id, mover_id) DO NOTHING
        RETURNING mover_id
      `;
      const createdMoverIds = inserted.map((row) => row.mover_id);

      if (createdMoverIds.length > 0) {
        await favoriteRepository.incrementFavoriteCounts(createdMoverIds, tx);
      }

      return { createdMoverIds };
    });
  },

  decrementFavoriteCounts(moverIds: number[], tx: PrismaTransaction = prisma) {
    return tx.moverProfile.updateMany({
      where: { userId: { in: moverIds } },
      data: { favoriteCount: { decrement: 1 } },
    });
  },

  async deleteOwned(userId: number, moverIds: number[]) {
    if (moverIds.length === 0) {
      return { deletedCount: 0, deletedMoverIds: [] as number[] };
    }

    return prisma.$transaction(async (tx) => {
      const deleted = await tx.$queryRaw<{ mover_id: number }[]>`
        DELETE FROM favorite
        WHERE user_id = ${userId}
          AND mover_id IN (${Prisma.join(moverIds)})
        RETURNING mover_id
      `;
      const deletedMoverIds = deleted.map((row) => row.mover_id);

      if (deletedMoverIds.length === 0) {
        return { deletedCount: 0, deletedMoverIds: [] as number[] };
      }

      await favoriteRepository.decrementFavoriteCounts(deletedMoverIds, tx);

      return { deletedCount: deletedMoverIds.length, deletedMoverIds };
    });
  },
};
