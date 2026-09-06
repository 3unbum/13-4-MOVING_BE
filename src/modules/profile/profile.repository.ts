import { prisma } from "../../config/prisma";
import type { UserRole } from "../../../generated/prisma/enums.ts";
import type { CustomerAccountUpdateInput, MoverAccountUpdateInput } from "./profile.type";

export const profileRepository = {
  /** row 존재 여부 = 프로필 등록 완료 여부 (customer/mover 각각 다른 테이블) */
  async exists(userId: number, role: UserRole): Promise<boolean> {
    if (role === "CUSTOMER") {
      const profile = await prisma.customerProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      return !!profile;
    }

    const profile = await prisma.moverProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return !!profile;
  },

  /** 계정 정보 + 프로필 + 이용 서비스를 한 번에 조회합니다. */
  async findCustomerAccount(userId: number) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: { customerProfile: true, customerServices: { select: { service: true } } },
    });
  },

  /** 계정 정보 + 프로필 + 제공 서비스·지역을 한 번에 조회합니다. */
  async findMoverAccount(userId: number) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        moverProfile: true,
        moverServices: { select: { service: true } },
        moverRegions: { select: { region: true } },
      },
    });
  },

  /** 계정(user) + 프로필(customerProfile) + 이용 서비스를 하나의 트랜잭션으로 수정합니다. */
  async updateCustomerAccount(userId: number, input: CustomerAccountUpdateInput): Promise<void> {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(input.account).length > 0) {
        await tx.user.update({ where: { id: userId }, data: input.account });
      }

      if (Object.keys(input.profile).length > 0) {
        await tx.customerProfile.update({ where: { userId }, data: input.profile });
      }

      if (input.services) {
        await tx.customerService.deleteMany({ where: { userId } });
        await tx.customerService.createMany({
          data: input.services.map((service) => ({ userId, service })),
        });
      }
    });
  },

  /** 계정(user) + 프로필(moverProfile) + 제공 서비스·지역을 하나의 트랜잭션으로 수정합니다. */
  async updateMoverAccount(userId: number, input: MoverAccountUpdateInput): Promise<void> {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(input.account).length > 0) {
        await tx.user.update({ where: { id: userId }, data: input.account });
      }

      if (Object.keys(input.profile).length > 0) {
        await tx.moverProfile.update({ where: { userId }, data: input.profile });
      }

      if (input.services) {
        await tx.moverService.deleteMany({ where: { moverId: userId } });
        await tx.moverService.createMany({
          data: input.services.map((service) => ({ moverId: userId, service })),
        });
      }

      if (input.regions) {
        await tx.moverRegion.deleteMany({ where: { moverId: userId } });
        await tx.moverRegion.createMany({
          data: input.regions.map((region) => ({ moverId: userId, region })),
        });
      }
    });
  },
};
