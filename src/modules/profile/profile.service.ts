import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET_NAME } from "../../config/s3";
import { env } from "../../config/env";
import type { DetectedImageType } from "../../common/utils/fileSignature.util";
import type { ProfileImageUploadResult } from "./profile.type";

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
};
