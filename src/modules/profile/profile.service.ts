import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET_NAME } from "../../config/s3";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import type { DetectedImageType } from "../../common/utils/fileSignature.util";
import { profileRepository } from "./profile.repository";
import type { CustomerProfileCreateDto, MoverProfileCreateDto } from "./profile.schema";
import type {
  CustomerProfileResponse,
  MoverProfileResponse,
  ProfileImageUploadResult,
} from "./profile.type";

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

  async registerCustomerProfile(
    userId: number,
    dto: CustomerProfileCreateDto
  ): Promise<CustomerProfileResponse> {
    const alreadyExists = await profileRepository.exists(userId, "CUSTOMER");
    if (alreadyExists) {
      throw AppError.conflict(ERROR_CODES.PROFILE_ALREADY_EXISTS, "이미 등록된 프로필입니다.");
    }

    const profile = await profileRepository.createCustomerProfile(userId, dto);

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

    const profile = await profileRepository.createMoverProfile(userId, dto);

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
};
