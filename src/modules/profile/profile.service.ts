import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET_NAME } from "../../config/s3";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import hashUtil from "../../common/utils/hash.util";
import type { DetectedImageType } from "../../common/utils/fileSignature.util";
import { profileRepository } from "./profile.repository";
import type { CustomerProfileUpdateDto, MoverProfileUpdateDto } from "./profile.schema";
import type {
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

    return { imageUrl: `https://${S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}` };
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
};
