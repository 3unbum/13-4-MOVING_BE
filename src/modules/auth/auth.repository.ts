import { prisma } from "../../config/prisma";
import type { PrismaTransaction } from "../../config/prisma";
import type { SocialProvider, UserRole } from "../../../generated/prisma/enums.ts";

/** 프로필 등록 여부 판단에 필요한 관계만 선택합니다. */
const withProfiles = {
  customerProfile: { select: { id: true } },
  moverProfile: { select: { id: true } },
} as const;

export const authRepository = {
  /**
   * (role, email) 복합 유니크로 조회합니다.
   * 같은 이메일로 일반 유저·기사님 각각 가입할 수 있습니다.
   */
  findByEmailAndRole(email: string, role: UserRole) {
    return prisma.user.findUnique({
      where: { role_email: { role, email } },
      include: withProfiles,
    });
  },

  /**
   * (role, provider, providerId) 복합 유니크로 조회합니다.
   * 소셜 로그인 콜백에서 기존 가입자를 찾을 때 사용합니다.
   */
  findBySocialAndRole(provider: SocialProvider, providerId: string, role: UserRole) {
    return prisma.user.findUnique({
      where: { role_provider_providerId: { role, provider, providerId } },
      include: withProfiles,
    });
  },

  findById(id: number) {
    return prisma.user.findUnique({
      where: { id },
      include: withProfiles,
    });
  },

  create(data: {
    role: UserRole;
    name: string;
    email: string;
    phoneNumber: string;
    password?: string;
    provider?: SocialProvider;
    providerId?: string;
  }) {
    return prisma.user.create({ data });
  },

  /** 로그인 시 저장, 로그아웃 시 null로 무효화합니다. */
  updateRefreshToken(id: number, refreshToken: string | null, tx: PrismaTransaction = prisma) {
    return tx.user.update({
      where: { id },
      data: { refreshToken },
    });
  },
};
