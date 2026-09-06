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
};
