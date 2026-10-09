import { prisma } from "../../config/prisma";
import type { PrismaTransaction } from "../../config/prisma";
import { Prisma } from "../../../generated/prisma/client.ts";
import type { SocialProvider, UserRole } from "../../../generated/prisma/enums.ts";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { REGION_LABELS } from "../mover/mover.type";

const DELETE_ACCOUNT_MAX_RETRIES = 3;

/** 탈퇴 결과. 탈퇴하지 못했으면 아무것도 지우지 않고 막힌 이유를 돌려줍니다 */
export type DeleteAccountResult = "DELETED" | "CONFIRMED_MOVE_EXISTS" | "UNPAID_PAYMENT_EXISTS";

/**
 * 탈퇴 후 User 행에 남기는 값. 행은 리뷰·완료된 견적이 참조하므로 지우지 않고 개인정보만 덮어씁니다.
 * 이름은 역할마다 달라 여기서 다루지 않습니다(고객은 그대로, 기사님은 별명으로 바꿈)
 */
const anonymizedUser = (userId: number) => ({
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

/** 고객 탈퇴. 확정된 이사(ASSIGNED)나 잔금을 내지 않은 완료 견적이 있으면 아무것도 지우지 않습니다 */
async function deleteCustomerAccount(
  tx: PrismaTransaction,
  userId: number
): Promise<DeleteAccountResult> {
  const assignedCount = await tx.quotationRequest.count({
    where: { userId, quotationStatus: "ASSIGNED" },
  });
  if (assignedCount > 0) return "CONFIRMED_MOVE_EXISTS";

  // 탈퇴하면 로그인할 수 없어 잔금을 낼 방법이 없어지고, 기사님은 돈을 받지 못합니다
  const unpaidCount = await tx.estimate.count({
    where: { quotationRequest: { userId }, estimateStatus: "COMPLETED", paymentStatus: "UNPAID" },
  });
  if (unpaidCount > 0) return "UNPAID_PAYMENT_EXISTS";

  await tx.chatRoom.deleteMany({ where: { customerId: userId } });
  // 본인 알림과, 남기는 요청·견적에 걸린 기사님 쪽 알림까지 지웁니다(탈퇴한 사람과의 지난 알림은 남길 이유가 없음)
  await tx.notification.deleteMany({
    where: {
      OR: [
        { userId },
        { quotationRequest: { userId } },
        { estimate: { quotationRequest: { userId } } },
      ],
    },
  });
  await tx.passwordResetCode.deleteMany({ where: { userId } });
  await tx.profileEditVerificationCode.deleteMany({ where: { userId } });
  // AI 찾기 대화 기록은 본인만 보므로 지웁니다. 메시지는 세션 Cascade로 함께 지워집니다
  await tx.moverAiSession.deleteMany({ where: { userId } });
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

  // 이름은 덮어쓰지 않습니다 — 기사님 화면의 지난 견적·결제 내역에 원래 이름이 그대로 나옵니다
  await tx.user.update({ where: { id: userId }, data: anonymizedUser(userId) });
  return "DELETED";
}

/** 기사님 탈퇴. 확정된 이사(CONFIRMED 견적)나 잔금을 받지 않은 완료 견적이 있으면 아무것도 지우지 않습니다 */
async function deleteMoverAccount(
  tx: PrismaTransaction,
  userId: number
): Promise<DeleteAccountResult> {
  const confirmedCount = await tx.estimate.count({
    where: { moverId: userId, estimateStatus: "CONFIRMED" },
  });
  if (confirmedCount > 0) return "CONFIRMED_MOVE_EXISTS";

  // 탈퇴하면 결제 요청·추가 금액 응답을 처리할 기사님이 없어집니다
  const unpaidCount = await tx.estimate.count({
    where: { moverId: userId, estimateStatus: "COMPLETED", paymentStatus: "UNPAID" },
  });
  if (unpaidCount > 0) return "UNPAID_PAYMENT_EXISTS";

  // 프로필을 지우기 전에 별명을 읽어 둡니다. 견적·결제 내역은 프로필이 없으면 User.name을 별명 자리에 씁니다(estimate.dto)
  const profile = await tx.moverProfile.findUnique({
    where: { userId },
    select: { nickName: true },
  });

  await tx.chatRoom.deleteMany({ where: { moverId: userId } });
  // 본인 알림과, 남기는 완료 견적에 걸린 고객 쪽 알림까지 지웁니다
  await tx.notification.deleteMany({
    where: { OR: [{ userId }, { estimate: { moverId: userId } }] },
  });
  await tx.passwordResetCode.deleteMany({ where: { userId } });
  await tx.profileEditVerificationCode.deleteMany({ where: { userId } });
  // 받은 리뷰는 모두 지웁니다(작성한 것·작성 전 모두). 남길 대상은 고객이 기사님에게 남긴 평가뿐인데 받을 기사님이 없어집니다
  await tx.review.deleteMany({ where: { estimate: { moverId: userId } } });
  // 완료된 견적(COMPLETED)은 고객의 이사 내역·결제 내역이 참조하므로 남깁니다
  await tx.estimate.deleteMany({
    where: { moverId: userId, estimateStatus: { in: ["PENDING", "REJECTED"] } },
  });
  await tx.targetedRequest.deleteMany({ where: { moverId: userId } });
  await tx.favorite.deleteMany({ where: { moverId: userId } });

  // 프로필을 지우면 기사님 찾기·상세·찜 목록에서 빠집니다(모두 프로필 존재 여부로 거름)
  await tx.moverService.deleteMany({ where: { moverId: userId } });
  await tx.moverRegion.deleteMany({ where: { moverId: userId } });
  await tx.moverProfile.deleteMany({ where: { userId } });

  // 실명 대신 별명을 남겨 고객이 지난 견적에서 누구였는지 알아볼 수 있게 합니다
  const name = profile ? `${profile.nickName} (탈퇴)` : "탈퇴한 기사님";
  await tx.user.update({ where: { id: userId }, data: { ...anonymizedUser(userId), name } });
  return "DELETED";
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

  /**
   * 이메일 인증을 마친 LOCAL 계정을 만들고 인증 행을 지웁니다(1회 사용).
   * 인증 행 삭제를 먼저 해서 같은 인증으로 동시에 가입해도 하나만 통과합니다.
   * verifiedSince 이후 인증한 행이 없으면 null — 유저 생성이 실패하면 삭제도 함께 롤백됩니다.
   */
  createVerifiedLocalUser(
    data: { role: UserRole; name: string; email: string; phoneNumber: string; password: string },
    verifiedSince: Date
  ) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.signupEmailVerificationCode.deleteMany({
        where: { email: data.email, role: data.role, verifiedAt: { gte: verifiedSince } },
      });
      if (count !== 1) return null;

      return tx.user.create({ data: { ...data, provider: "LOCAL" } });
    });
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

  /** 재발송하면 이전 인증번호·인증 기록을 지우고 새로 만듭니다(비밀번호 재설정과 같은 삭제 후 생성) */
  replaceSignupVerificationCode(email: string, role: UserRole, codeHash: string, expiresAt: Date) {
    return prisma.$transaction(async (tx) => {
      await tx.signupEmailVerificationCode.deleteMany({ where: { email, role } });
      return tx.signupEmailVerificationCode.create({
        data: { email, role, codeHash, expiresAt },
      });
    });
  },

  findSignupVerificationCode(email: string, role: UserRole) {
    return prisma.signupEmailVerificationCode.findUnique({
      where: { email_role: { email, role } },
    });
  },

  /** 조건 확인과 증가를 한 쿼리로 — 동시 요청에도 상한을 넘지 않게. 상한이면 null */
  async incrementSignupCodeFailedAttempts(id: number, maxAttempts: number): Promise<number | null> {
    const updated = await prisma.signupEmailVerificationCode.updateManyAndReturn({
      where: { id, failedAttempts: { lt: maxAttempts } },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    return updated.length > 0 ? updated[0].failedAttempts : null;
  },

  /**
   * 인증 성공 기록. 만료·실패 횟수도 WHERE로 다시 확인 — 동시 오답 요청이 먼저 상한을 채웠으면 정답이어도 기록하지 않음.
   * 그 사이 재발송으로 행이 바뀌었거나 위 조건에 걸리면 false
   */
  async markSignupCodeVerified(id: number, maxAttempts: number): Promise<boolean> {
    const { count } = await prisma.signupEmailVerificationCode.updateMany({
      where: { id, expiresAt: { gt: new Date() }, failedAttempts: { lt: maxAttempts } },
      data: { verifiedAt: new Date() },
    });
    return count === 1;
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

  /** 탈퇴 전 확인용 — 탈퇴 여부와 프로필 수정 진입 이메일 인증 시각(usedAt) */
  findForDeleteAccount(id: number) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        deletedAt: true,
        profileEditVerificationCode: { select: { usedAt: true } },
      },
    });
  },

  /**
   * 회원 탈퇴. 탈퇴했으면 "DELETED", 확정된 이사나 미결제 견적이 남아 탈퇴하지 못했으면 그 이유.
   *
   * 확인과 삭제 사이에 견적이 확정되면 확정된 이사를 지우게 되므로 Serializable로 묶고,
   * 직렬화 충돌(P2034)은 재시도합니다.
   */
  async deleteAccount(userId: number, role: UserRole): Promise<DeleteAccountResult> {
    for (let attempt = 1; attempt <= DELETE_ACCOUNT_MAX_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(
          (tx: PrismaTransaction) =>
            role === "MOVER" ? deleteMoverAccount(tx, userId) : deleteCustomerAccount(tx, userId),
          { isolationLevel: "Serializable" }
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          if (attempt < DELETE_ACCOUNT_MAX_RETRIES) continue;
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
