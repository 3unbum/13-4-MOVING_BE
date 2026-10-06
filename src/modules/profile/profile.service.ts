import { randomInt, randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET_NAME, buildPublicFileUrl } from "../../config/s3";
import { mailer, MAIL_FROM } from "../../config/mailer";
import { Prisma } from "../../../generated/prisma/client";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import hashUtil from "../../common/utils/hash.util";
import type { DetectedImageType } from "../../common/utils/fileSignature.util";
import { profileRepository } from "./profile.repository";
import {
  PROFILE_EDIT_CODE_TTL_MINUTES,
  PROFILE_EDIT_CODE_MAX_FAILED_ATTEMPTS,
} from "./profile.constants";
import { buildProfileEditCodeMail } from "./profile-email-verification/profileEditCodeMail";
import type {
  CustomerProfileCreateDto,
  MoverProfileCreateDto,
  CustomerProfileUpdateDto,
  MoverProfileUpdateDto,
} from "./profile.schema";
import type {
  CustomerProfileResponse,
  MoverProfileResponse,
  CustomerAccountResponse,
  MoverAccountResponse,
  ProfileImageUploadResult,
} from "./profile.type";

/** currentPassword 검증 후 해시된 newPassword를 반환합니다. newPassword 미전송 시 undefined. */
async function resolvePasswordUpdate(
  currentPasswordHash: string | null,
  dto: { currentPassword?: string; newPassword?: string }
): Promise<string | undefined> {
  if (!dto.newPassword) {
    return undefined;
  }

  // 소셜 로그인 계정은 password가 없어서 비교 자체가 불가능합니다.
  if (!currentPasswordHash) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다."
    );
  }

  // newPassword가 있으면 스키마에서 currentPassword를 필수로 강제하지만, 타입은 optional이라 방어적으로 처리
  const isValid = await hashUtil.verifyPassword(dto.currentPassword ?? "", currentPasswordHash);
  if (!isValid) {
    throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, "현재 비밀번호가 일치하지 않습니다.");
  }

  return hashUtil.hashPassword(dto.newPassword);
}

/** 미가입·코드 없음·사용된 코드도 같은 에러 — 다른 유저의 인증 시도 정보를 숨깁니다 */
const invalidProfileEditCodeError = () =>
  AppError.badRequest(ERROR_CODES.INVALID_PROFILE_EDIT_CODE, "인증번호가 일치하지 않습니다");

const profileEditCodeAttemptsExceededError = () =>
  AppError.badRequest(
    ERROR_CODES.PROFILE_EDIT_CODE_ATTEMPTS_EXCEEDED,
    "인증번호를 여러 번 틀려 무효가 되었습니다. 인증번호를 다시 받아주세요"
  );

const generateProfileEditCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

export const profileService = {
  async uploadProfileImage(
    buffer: Buffer,
    { mimeType, extension }: DetectedImageType
  ): Promise<ProfileImageUploadResult> {
    // 클라이언트가 보낸 파일명이 아니라 실제 바이트로 판별한 확장자로 키를 만듭니다.
    const key = `profile/${randomUUID()}.${extension}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );

    return { imageUrl: buildPublicFileUrl(key) };
  },

  async registerCustomerProfile(
    userId: number,
    dto: CustomerProfileCreateDto
  ): Promise<CustomerProfileResponse> {
    const alreadyExists = await profileRepository.exists(userId, "CUSTOMER");
    if (alreadyExists) {
      throw AppError.conflict(ERROR_CODES.PROFILE_ALREADY_EXISTS, "이미 등록된 프로필입니다.");
    }

    // 위 조회 이후 동시 요청이 먼저 저장하면 userId 유니크가 막고 P2002를 던짐
    const profile = await profileRepository.createCustomerProfile(userId, dto).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw AppError.conflict(ERROR_CODES.PROFILE_ALREADY_EXISTS, "이미 등록된 프로필입니다.");
      }
      throw error;
    });

    return {
      id: profile.id,
      userId: profile.userId,
      image: profile.image,
      region: dto.region,
      services: dto.services,
    };
  },

  async registerMoverProfile(
    userId: number,
    dto: MoverProfileCreateDto
  ): Promise<MoverProfileResponse> {
    const alreadyExists = await profileRepository.exists(userId, "MOVER");
    if (alreadyExists) {
      throw AppError.conflict(ERROR_CODES.PROFILE_ALREADY_EXISTS, "이미 등록된 프로필입니다.");
    }

    // 위 조회 이후 동시 요청이 먼저 저장하면 userId 유니크가 막고 P2002를 던짐
    const profile = await profileRepository.createMoverProfile(userId, dto).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw AppError.conflict(ERROR_CODES.PROFILE_ALREADY_EXISTS, "이미 등록된 프로필입니다.");
      }
      throw error;
    });

    return {
      id: profile.id,
      userId: profile.userId,
      image: profile.image,
      nickName: profile.nickName,
      career: profile.career,
      bio: profile.bio,
      description: profile.description,
      services: dto.services,
      regions: dto.regions,
    };
  },

  async getCustomerAccount(userId: number): Promise<CustomerAccountResponse> {
    const user = await profileRepository.findCustomerAccount(userId);
    if (!user) {
      throw AppError.notFound("유저를 찾을 수 없습니다.");
    }

    const profile = user.customerProfile;

    return {
      userId: user.id,
      role: "CUSTOMER",
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      hasProfile: !!profile,
      hasPassword: !!user.password,
      image: profile?.image ?? null,
      region: profile?.region ?? null,
      services: user.customerServices.map((row) => row.service),
    };
  },

  async getMoverAccount(userId: number): Promise<MoverAccountResponse> {
    const user = await profileRepository.findMoverAccount(userId);
    if (!user) {
      throw AppError.notFound("유저를 찾을 수 없습니다.");
    }

    const profile = user.moverProfile;

    return {
      userId: user.id,
      role: "MOVER",
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      hasProfile: !!profile,
      hasPassword: !!user.password,
      image: profile?.image ?? null,
      nickName: profile?.nickName ?? null,
      career: profile?.career ?? null,
      bio: profile?.bio ?? null,
      description: profile?.description ?? null,
      avgRating: profile ? Number(profile.avgRating) : null,
      services: user.moverServices.map((row) => row.service),
      regions: user.moverRegions.map((row) => row.region),
    };
  },

  async updateCustomerAccount(
    userId: number,
    dto: CustomerProfileUpdateDto
  ): Promise<CustomerAccountResponse> {
    const user = await profileRepository.findCustomerAccount(userId);
    if (!user) {
      throw AppError.notFound("유저를 찾을 수 없습니다.");
    }

    const password = await resolvePasswordUpdate(user.password, dto);

    await profileRepository.updateCustomerAccount(userId, {
      account: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
        ...(password !== undefined && { password }),
      },
      profile: {
        ...(dto.image !== undefined && { image: dto.image }),
        ...(dto.region !== undefined && { region: dto.region }),
      },
      services: dto.services,
    });

    const updated = await profileRepository.findCustomerAccount(userId);
    if (!updated) {
      throw AppError.notFound("유저를 찾을 수 없습니다.");
    }

    const profile = updated.customerProfile;
    return {
      userId: updated.id,
      role: "CUSTOMER",
      name: updated.name,
      email: updated.email,
      phoneNumber: updated.phoneNumber,
      hasProfile: !!profile,
      hasPassword: !!updated.password,
      image: profile?.image ?? null,
      region: profile?.region ?? null,
      services: updated.customerServices.map((row) => row.service),
    };
  },

  async updateMoverAccount(
    userId: number,
    dto: MoverProfileUpdateDto
  ): Promise<MoverAccountResponse> {
    const user = await profileRepository.findMoverAccount(userId);
    if (!user) {
      throw AppError.notFound("유저를 찾을 수 없습니다.");
    }

    const password = await resolvePasswordUpdate(user.password, dto);

    await profileRepository.updateMoverAccount(userId, {
      account: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
        ...(password !== undefined && { password }),
      },
      profile: {
        ...(dto.image !== undefined && { image: dto.image }),
        ...(dto.nickName !== undefined && { nickName: dto.nickName }),
        ...(dto.career !== undefined && { career: dto.career }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      services: dto.services,
      regions: dto.regions,
    });

    const updated = await profileRepository.findMoverAccount(userId);
    if (!updated) {
      throw AppError.notFound("유저를 찾을 수 없습니다.");
    }

    // avgRating은 요청 dto에 필드 자체가 없어(zod 스키마에서 제외) 이 API로는 절대 변경되지 않습니다.
    const profile = updated.moverProfile;
    return {
      userId: updated.id,
      role: "MOVER",
      name: updated.name,
      email: updated.email,
      phoneNumber: updated.phoneNumber,
      hasProfile: !!profile,
      hasPassword: !!updated.password,
      image: profile?.image ?? null,
      nickName: profile?.nickName ?? null,
      career: profile?.career ?? null,
      bio: profile?.bio ?? null,
      description: profile?.description ?? null,
      avgRating: profile ? Number(profile.avgRating) : null,
      services: updated.moverServices.map((row) => row.service),
      regions: updated.moverRegions.map((row) => row.region),
    };
  },

  /** 발송 성공 여부와 무관하게 메일 발송을 시도합니다. 이미 인증된 사용자라 존재 여부를 숨길 필요는 없습니다. */
  async sendProfileEmailVerificationCode(userId: number): Promise<void> {
    const user = await profileRepository.findUserEmailById(userId);
    if (!user) {
      throw AppError.notFound("유저를 찾을 수 없습니다.");
    }

    const code = generateProfileEditCode();
    const expiresAt = new Date(Date.now() + PROFILE_EDIT_CODE_TTL_MINUTES * 60 * 1000);
    try {
      await profileRepository.replaceProfileEditVerificationCode(
        userId,
        hashUtil.hashResetCode(code),
        expiresAt
      );
    } catch (error) {
      // 같은 유저의 동시 요청이 먼저 행을 만들면 userId 유니크가 막음 — 먼저 온 요청이 메일을 보내므로 여기선 재발송하지 않음
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }
      throw error;
    }

    await mailer.sendMail({
      from: MAIL_FROM,
      to: user.email,
      ...(await buildProfileEditCodeMail(code, PROFILE_EDIT_CODE_TTL_MINUTES)),
    });
  },

  async verifyProfileEmailVerificationCode(userId: number, code: string): Promise<void> {
    const editCode = await profileRepository.findProfileEditVerificationCodeByUserId(userId);
    if (!editCode || editCode.usedAt) {
      throw invalidProfileEditCodeError();
    }

    if (editCode.expiresAt <= new Date()) {
      throw AppError.badRequest(
        ERROR_CODES.PROFILE_EDIT_CODE_EXPIRED,
        "인증번호가 만료되었습니다. 인증번호를 다시 받아주세요"
      );
    }
    if (editCode.failedAttempts >= PROFILE_EDIT_CODE_MAX_FAILED_ATTEMPTS) {
      throw profileEditCodeAttemptsExceededError();
    }

    if (!hashUtil.compareResetCode(code, editCode.codeHash)) {
      const failedAttempts = await profileRepository.incrementProfileEditCodeFailedAttempts(
        editCode.id,
        PROFILE_EDIT_CODE_MAX_FAILED_ATTEMPTS
      );
      // null: 동시 요청이 먼저 상한을 채움 / 상한 도달: 이번이 마지막 기회였음 → 둘 다 이제 이 코드는 무효
      if (failedAttempts === null || failedAttempts >= PROFILE_EDIT_CODE_MAX_FAILED_ATTEMPTS) {
        throw profileEditCodeAttemptsExceededError();
      }
      throw invalidProfileEditCodeError();
    }

    const completed = await profileRepository.completeProfileEditVerification(editCode.id, userId);
    if (!completed) {
      throw invalidProfileEditCodeError();
    }
  },
};
