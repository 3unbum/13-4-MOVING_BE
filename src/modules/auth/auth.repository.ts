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

  /**
   * 아이디 찾기용. 다른 조회와 달리 LOCAL로 좁히지 않고 소셜 계정도 함께 조회합니다.
   * 같은 role 안에서도 이메일 가입 계정과 소셜 계정이 공존할 수 있어 여러 건이 나올 수 있습니다.
   */
  findAccountsByNameAndPhone(role: UserRole, name: string, phoneNumber: string) {
    return prisma.user.findMany({
      where: { role, name, phoneNumber },
      select: { email: true, provider: true },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * 유저당 한 행만 유지하므로 재발송 시 기존 행을 지우고 새로 만듭니다.
   * upsert로 덮어쓰면 id가 그대로 남아, 이전에 발급한 재설정 토큰(codeId)이 다시 유효해집니다.
   */
  replacePasswordResetCode(userId: number, codeHash: string, expiresAt: Date) {
    return prisma.$transaction(async (tx) => {
      await tx.passwordResetCode.deleteMany({ where: { userId } });
      return tx.passwordResetCode.create({ data: { userId, codeHash, expiresAt } });
    });
  },

  findPasswordResetCodeByUserId(userId: number) {
    return prisma.passwordResetCode.findUnique({ where: { userId } });
  },

  /**
   * 상한 미만일 때만 1 올립니다. 조건 확인과 증가를 한 쿼리로 해야
   * 틀린 코드를 동시에 여러 개 보내도 상한을 넘지 않습니다.
   * 올린 뒤의 값을 반환하고, 이미 상한에 도달해 있어 올리지 못했으면 null
   */
  async incrementResetCodeFailedAttempts(id: number, maxAttempts: number) {
    // update는 조건에 맞는 행이 없으면 예외(P2025)와 함께 prisma:error 로그를 남기므로, 빈 배열을 주는 쪽을 씁니다
    const [updated] = await prisma.passwordResetCode.updateManyAndReturn({
      where: { id, failedAttempts: { lt: maxAttempts } },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    return updated?.failedAttempts ?? null;
  },

  /**
   * 재설정 토큰 1회 사용 처리 + 비밀번호 변경 + 다른 기기 세션 무효화를 한 트랜잭션으로 합니다.
   * usedAt 조건을 건 updateMany로 사용 처리를 먼저 해서, 같은 토큰으로 동시에 요청해도 하나만 통과합니다.
   * 처리했으면 true, 이미 사용됐거나 없는 코드면 false
   */
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
