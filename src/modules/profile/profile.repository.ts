import { prisma } from "../../config/prisma";
import type { UserRole } from "../../../generated/prisma/enums.ts";

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
};
