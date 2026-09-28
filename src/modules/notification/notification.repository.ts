import type { PrismaTransaction } from "../../config/prisma";
import type { CreateNotificationInput } from "./notification.type";
import { notificationDetailInclude } from "./notification.mapper";

export const notificationRepository = {
  create(tx: PrismaTransaction, input: CreateNotificationInput) {
    return tx.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        estimateId: input.estimateId,
        quotationRequestId: input.quotationRequestId,
      },
      include: notificationDetailInclude,
    });
  },

  findManyByUserId(
    tx: PrismaTransaction,
    userId: number,
    isRead: boolean | undefined,
    cursor: number | undefined,
    take: number
  ) {
    return tx.notification.findMany({
      where: {
        userId,
        ...(isRead !== undefined && { isRead }),
      },
      orderBy: { id: "desc" },
      take,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
      include: notificationDetailInclude,
    });
  },

  findById(tx: PrismaTransaction, id: number) {
    return tx.notification.findUnique({
      where: { id },
      include: notificationDetailInclude,
    });
  },

  markRead(tx: PrismaTransaction, id: number, userId: number) {
    return tx.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  },

  markAllRead(tx: PrismaTransaction, userId: number) {
    return tx.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  },

  async deleteOwned(tx: PrismaTransaction, userId: number, ids: number[]) {
    if (ids.length === 0) {
      return { deletedCount: 0, deletedIds: [] as number[] };
    }

    const owned = await tx.notification.findMany({
      where: { userId, id: { in: ids } },
      select: { id: true },
    });
    const deletedIds = owned.map((row) => row.id);
    if (deletedIds.length === 0) {
      return { deletedCount: 0, deletedIds };
    }

    await tx.notification.deleteMany({
      where: { userId, id: { in: deletedIds } },
    });

    return { deletedCount: deletedIds.length, deletedIds };
  },
};
