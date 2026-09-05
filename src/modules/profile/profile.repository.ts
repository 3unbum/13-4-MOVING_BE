import { prisma } from "../../config/prisma";

export const profileRepository = {
  /** 계정 정보 + 프로필 + 이용 서비스를 한 번에 조회합니다. */
  async findCustomerAccount(userId: number) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        customerProfile: true,
        customerServices: { select: { service: true } },
      },
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
