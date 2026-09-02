import { prisma } from "@/config/prisma";

const moverDetailInclude = {
  moverProfile: true,
  moverServices: { select: { service: true } },
  moverRegions: { select: { region: true } },
};

export const moverRepository = {
  findDetailByUserId(userId: number) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: moverDetailInclude,
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
};
