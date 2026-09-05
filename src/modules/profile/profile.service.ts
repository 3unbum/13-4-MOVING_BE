import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET_NAME } from "../../config/s3";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import type { DetectedImageType } from "../../common/utils/fileSignature.util";
import { profileRepository } from "./profile.repository";
import type {
  CustomerAccountResponse,
  MoverAccountResponse,
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
};
