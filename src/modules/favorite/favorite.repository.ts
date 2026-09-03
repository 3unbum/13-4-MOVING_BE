import { prisma } from "../../config/prisma";
import type { PrismaTransaction } from "../../config/prisma";

const moverCardInclude = {
  mover: {
    select: {
      id: true,
      moverProfile: {
        select: {
          nickName: true,
          bio: true,
          image: true,
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
    return prisma.$transaction(async (tx) => {
      const row = await favoriteRepository.create(userId, moverId, tx);
      await favoriteRepository.incrementFavoriteCount(moverId, tx);
      return row;
    });
  },

  findOwnedMoverIds(userId: number, moverIds: number[], tx: PrismaTransaction = prisma) {
    return tx.favorite.findMany({
      where: { userId, moverId: { in: moverIds } },
      select: { moverId: true },
    });
  },

  deleteMany(userId: number, moverIds: number[], tx: PrismaTransaction = prisma) {
    return tx.favorite.deleteMany({
      where: { userId, moverId: { in: moverIds } },
    });
  },

  decrementFavoriteCounts(moverIds: number[], tx: PrismaTransaction = prisma) {
    return tx.moverProfile.updateMany({
      where: { userId: { in: moverIds } },
      data: { favoriteCount: { decrement: 1 } },
    });
  },

  async deleteOwned(userId: number, moverIds: number[]) {
    return prisma.$transaction(async (tx) => {
      const owned = await favoriteRepository.findOwnedMoverIds(userId, moverIds, tx);
      const ownedMoverIds = owned.map((row) => row.moverId);

      if (ownedMoverIds.length === 0) {
        return { deletedCount: 0, deletedMoverIds: [] as number[] };
      }

      await favoriteRepository.deleteMany(userId, ownedMoverIds, tx);
      await favoriteRepository.decrementFavoriteCounts(ownedMoverIds, tx);

      return { deletedCount: ownedMoverIds.length, deletedMoverIds: ownedMoverIds };
    });
  },
};
