import { prisma } from "@/config/prisma";
import type { Prisma } from "../../../generated/prisma/client.ts";
import type { FindMoverListParams, MoverListCursor, MoverListSort } from "./mover.type";

const moverDetailInclude = {
  moverProfile: true,
  moverServices: { select: { service: true } },
  moverRegions: { select: { region: true } },
};

const listInclude = {
  user: {
    select: {
      moverServices: { select: { service: true } },
      moverRegions: { select: { region: true } },
    },
  },
};

function buildOrderBy(sort: MoverListSort): Prisma.MoverProfileOrderByWithRelationInput[] {
  switch (sort) {
    case "rating":
      return [{ avgRating: "desc" }, { id: "desc" }];
    case "career":
      return [{ career: "desc" }, { id: "desc" }];
    case "confirmed":
      return [{ confirmedCount: "desc" }, { id: "desc" }];
    case "review":
    default:
      return [{ reviewCount: "desc" }, { id: "desc" }];
  }
}

function buildCursorWhere(
  sort: MoverListSort,
  cursor: MoverListCursor
): Prisma.MoverProfileWhereInput {
  switch (sort) {
    case "rating":
      return {
        OR: [
          { avgRating: { lt: cursor.avgRating } },
          { avgRating: cursor.avgRating, id: { lt: cursor.profileId } },
        ],
      };
    case "career":
      return {
        OR: [
          { career: { lt: cursor.career } },
          { career: cursor.career, id: { lt: cursor.profileId } },
        ],
      };
    case "confirmed":
      return {
        OR: [
          { confirmedCount: { lt: cursor.confirmedCount } },
          { confirmedCount: cursor.confirmedCount, id: { lt: cursor.profileId } },
        ],
      };
    case "review":
    default:
      return {
        OR: [
          { reviewCount: { lt: cursor.reviewCount } },
          { reviewCount: cursor.reviewCount, id: { lt: cursor.profileId } },
        ],
      };
  }
}

export const moverRepository = {
  findDetailByUserId(userId: number) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: moverDetailInclude,
    });
  },

  findList({ keyword, region, service, sort, cursor, limit }: FindMoverListParams) {
    const where: Prisma.MoverProfileWhereInput = {
      user: {
        role: "MOVER",
        ...(region && { moverRegions: { some: { region } } }),
        ...(service && { moverServices: { some: { service } } }),
      },
      ...(keyword && {
        nickName: { contains: keyword, mode: "insensitive" },
      }),
      ...(cursor && buildCursorWhere(sort, cursor)),
    };

    return prisma.moverProfile.findMany({
      where,
      orderBy: buildOrderBy(sort),
      take: limit + 1,
      include: listInclude,
    });
  },

  async existsFavorite(userId: number, moverId: number) {
    const row = await prisma.favorite.findUnique({
      where: { userId_moverId: { userId, moverId } },
      select: { id: true },
    });

    return row !== null;
  },

  async isTargetedInActiveRequest(customerId: number, moverId: number) {
    const activeRequest = await prisma.quotationRequest.findFirst({
      where: {
        userId: customerId,
        quotationStatus: { in: ["PENDING", "ASSIGNED"] },
      },
      select: { id: true },
    });

    if (!activeRequest) {
      return false;
    }

    const targeted = await prisma.targetedRequest.findUnique({
      where: {
        quotationRequestId_moverId: {
          quotationRequestId: activeRequest.id,
          moverId,
        },
      },
      select: { id: true },
    });

    return targeted !== null;
  },

  async existsMover(moverId: number) {
    const row = await prisma.user.findFirst({
      where: { id: moverId, role: "MOVER", moverProfile: { isNot: null } },
      select: { id: true },
    });
    return row !== null;
  },

  findConfirmedReviewsByMoverId(moverId: number, page: number, limit: number) {
    const where = {
      status: "CONFIRMED" as const,
      estimate: { moverId },
    };

    return prisma.$transaction([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      prisma.review.count({ where }),
    ]);
  },
};

export type MoverListProfile = Awaited<ReturnType<typeof moverRepository.findList>>[number];
