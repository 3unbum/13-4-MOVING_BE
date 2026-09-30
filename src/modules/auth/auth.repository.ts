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
   * 이메일 가입(LOCAL) 계정을 (role, email)로 조회합니다.
   * 같은 이메일로 일반 유저·기사님 각각 가입할 수 있습니다.
   *
   * (role, email) 전체 유니크를 두지 않아 findUnique를 쓸 수 없습니다.
   * 중복 방지는 부분 유니크 인덱스(user_role_email_local_key)가 담당합니다.
   */
  findByEmailAndRole(email: string, role: UserRole) {
    return prisma.user.findFirst({
      where: { role, email, provider: "LOCAL" },
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

  existsByEmailAndRole(email: string, role: UserRole) {
    return prisma.user.findFirst({
      where: { role, email, provider: "LOCAL" },
      select: { id: true },
    });
  },

  findAccountsByNameAndPhone(role: UserRole, name: string, phoneNumber: string) {
    return prisma.user.findMany({
      where: { role, name, phoneNumber },
      select: { email: true, provider: true },
      orderBy: { createdAt: "asc" },
    });
  },

  /** upsert 금지(삭제 후 생성) — id가 유지되면 이전 재설정 토큰이 다시 유효해짐 */
  replacePasswordResetCode(userId: number, codeHash: string, expiresAt: Date) {
    return prisma.$transaction(async (tx) => {
      await tx.passwordResetCode.deleteMany({ where: { userId } });
      return tx.passwordResetCode.create({ data: { userId, codeHash, expiresAt } });
    });
  },

  findPasswordResetCodeByUserId(userId: number) {
    return prisma.passwordResetCode.findUnique({ where: { userId } });
  },

  /** 조건 확인과 증가를 한 쿼리로 — 동시 요청에도 상한을 넘지 않게. 상한이면 null */
  async incrementResetCodeFailedAttempts(id: number, maxAttempts: number): Promise<number | null> {
    // update는 조건에 맞는 행이 없으면 예외(P2025)와 함께 prisma:error 로그를 남기므로, 빈 배열을 주는 쪽을 씁니다
    const updated = await prisma.passwordResetCode.updateManyAndReturn({
      where: { id, failedAttempts: { lt: maxAttempts } },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    return updated.length > 0 ? updated[0].failedAttempts : null;
  },

  /** usedAt 조건으로 먼저 사용 처리 — 같은 토큰 동시 요청 중 하나만 통과. 처리했으면 true */
  completePasswordReset(codeId: number, userId: number, hashedPassword: string) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetCode.updateMany({
        where: { id: codeId, userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count !== 1) return false;

      await tx.user.update({
        where: { id: userId },
        data: { password: hashedPassword, refreshToken: null },
      });
      return true;
    });
  },
};
