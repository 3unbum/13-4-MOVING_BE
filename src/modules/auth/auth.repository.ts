import { prisma } from "../../config/prisma";
import type { PrismaTransaction } from "../../config/prisma";
import { Prisma } from "../../../generated/prisma/client.ts";
import type { SocialProvider, UserRole } from "../../../generated/prisma/enums.ts";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { REGION_LABELS } from "../mover/mover.type";

const WITHDRAW_MAX_RETRIES = 3;

/** 탈퇴 후 User 행에 남기는 값. 행은 리뷰·완료된 견적이 참조하므로 지우지 않고 개인정보만 덮어씁니다 */
const anonymizedUser = (userId: number, role: UserRole) => ({
  name: role === "MOVER" ? "탈퇴한 기사님" : "탈퇴한 회원",
  // NOT NULL이라 비울 수 없어 실제로 존재할 수 없는 도메인(.invalid)으로 바꿉니다
  email: `deleted-${userId}@deleted.invalid`,
  phoneNumber: "",
  password: null,
  // provider를 비워야 이메일 가입 부분 유니크(WHERE provider = 'LOCAL')와 소셜 유니크에 걸리지 않아 재가입이 됩니다
  provider: null,
  providerId: null,
  refreshToken: null,
  deletedAt: new Date(),
});

/** 고객 탈퇴. 확정된 이사(ASSIGNED)가 있으면 아무것도 지우지 않고 false */
async function withdrawCustomer(tx: PrismaTransaction, userId: number) {
  const assignedCount = await tx.quotationRequest.count({
    where: { userId, quotationStatus: "ASSIGNED" },
  });
  if (assignedCount > 0) return false;

  await tx.chatRoom.deleteMany({ where: { customerId: userId } });
  await tx.notification.deleteMany({ where: { userId } });
  await tx.passwordResetCode.deleteMany({ where: { userId } });
  // 작성하지 않은 리뷰는 쓸 사람이 없어 지우고, 작성한 리뷰(CONFIRMED)는 기사님 평점과 함께 남깁니다
  await tx.review.deleteMany({ where: { customerId: userId, status: "PENDING" } });

  // 이사가 끝난(COMPLETED) 요청만 남깁니다. 나머지는 Cascade로 견적·지정 요청·알림이 함께 지워집니다
  await tx.quotationRequest.deleteMany({
    where: { userId, quotationStatus: { not: "COMPLETED" } },
  });
  await tx.estimate.deleteMany({
    where: { quotationRequest: { userId }, estimateStatus: { in: ["PENDING", "REJECTED"] } },
  });

  // 남긴 요청의 주소는 시도 이름만 남깁니다. 빈 문자열이면 기사님 견적 카드가 빈칸으로 나옵니다
  const keptRequests = await tx.quotationRequest.findMany({
    where: { userId },
    select: { id: true, fromRegion: true, toRegion: true },
  });
  for (const request of keptRequests) {
    await tx.quotationRequest.update({
      where: { id: request.id },
      data: {
        fromPostalCode: "",
        fromAddress: REGION_LABELS[request.fromRegion],
        fromDetailAddress: "",
        toPostalCode: "",
        toAddress: REGION_LABELS[request.toRegion],
        toDetailAddress: "",
      },
    });
  }

  await tx.customerService.deleteMany({ where: { userId } });
  await tx.customerProfile.deleteMany({ where: { userId } });
  // 찜(favorite)은 남깁니다. 지우면 기사님의 favoriteCount와 실제 행 수가 어긋납니다

  await tx.user.update({ where: { id: userId }, data: anonymizedUser(userId, "CUSTOMER") });
  return true;
}

/** 기사님 탈퇴. 확정된 이사(CONFIRMED 견적)가 있으면 아무것도 지우지 않고 false */
async function withdrawMover(tx: PrismaTransaction, userId: number) {
  const confirmedCount = await tx.estimate.count({
    where: { moverId: userId, estimateStatus: "CONFIRMED" },
  });
  if (confirmedCount > 0) return false;

  await tx.chatRoom.deleteMany({ where: { moverId: userId } });
  await tx.notification.deleteMany({ where: { userId } });
  await tx.passwordResetCode.deleteMany({ where: { userId } });
  // 완료된 견적(COMPLETED)은 고객의 견적 내역·리뷰가 참조하므로 남깁니다
  await tx.estimate.deleteMany({
    where: { moverId: userId, estimateStatus: { in: ["PENDING", "REJECTED"] } },
  });
  await tx.targetedRequest.deleteMany({ where: { moverId: userId } });
  await tx.favorite.deleteMany({ where: { moverId: userId } });

  // 프로필을 지우면 기사님 찾기·상세·찜 목록에서 빠집니다(모두 프로필 존재 여부로 거름)
  await tx.moverService.deleteMany({ where: { moverId: userId } });
  await tx.moverRegion.deleteMany({ where: { moverId: userId } });
  await tx.moverProfile.deleteMany({ where: { userId } });

  await tx.user.update({ where: { id: userId }, data: anonymizedUser(userId, "MOVER") });
  return true;
}

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

  /**
   * 회원 탈퇴. 탈퇴했으면 true, 확정된 이사가 남아 탈퇴하지 못했으면 false.
   *
   * 확인과 삭제 사이에 견적이 확정되면 확정된 이사를 지우게 되므로 Serializable로 묶고,
   * 직렬화 충돌(P2034)은 재시도합니다.
   */
  async withdraw(userId: number, role: UserRole) {
    for (let attempt = 1; attempt <= WITHDRAW_MAX_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(
          (tx: PrismaTransaction) =>
            role === "MOVER" ? withdrawMover(tx, userId) : withdrawCustomer(tx, userId),
          { isolationLevel: "Serializable" }
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          if (attempt < WITHDRAW_MAX_RETRIES) continue;
          throw AppError.conflict(
            ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
            "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
          );
        }
        throw error;
      }
    }

    throw AppError.conflict(
      ERROR_CODES.CONCURRENT_REQUEST_CONFLICT,
      "요청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
    );
  },
};
