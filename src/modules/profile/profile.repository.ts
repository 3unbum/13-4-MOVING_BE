import { prisma } from "../../config/prisma";
import type { UserRole } from "../../../generated/prisma/enums.ts";
import type { CustomerProfileCreateDto, MoverProfileCreateDto } from "./profile.schema";

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

  /** 프로필 + 이용 서비스를 한 트랜잭션으로 생성합니다. */
  async createCustomerProfile(userId: number, dto: CustomerProfileCreateDto) {
    return prisma.$transaction(async (tx) => {
      const profile = await tx.customerProfile.create({
        data: { userId, image: dto.image, region: dto.region },
      });
      await tx.customerService.createMany({
        data: dto.services.map((service) => ({ userId, service })),
      });
      return profile;
    });
  },

  /** 프로필 + 제공 서비스 + 서비스 가능 지역을 한 트랜잭션으로 생성합니다. */
  async createMoverProfile(userId: number, dto: MoverProfileCreateDto) {
    return prisma.$transaction(async (tx) => {
      const profile = await tx.moverProfile.create({
        data: {
          userId,
          image: dto.image,
          nickName: dto.nickName,
          career: dto.career,
          bio: dto.bio,
          description: dto.description,
        },
      });
      await tx.moverService.createMany({
        data: dto.services.map((service) => ({ moverId: userId, service })),
      });
      await tx.moverRegion.createMany({
        data: dto.regions.map((region) => ({ moverId: userId, region })),
      });
      return profile;
    });
  },
};
