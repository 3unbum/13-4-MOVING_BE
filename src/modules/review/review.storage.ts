import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { S3_BUCKET_NAME, buildPublicFileUrl, s3Client } from "../../config/s3";
import type { DetectedImageType } from "../../common/utils/fileSignature.util";

/**
 * 리뷰 사진 업로드. 파일명은 클라이언트 값이 아니라 실제 바이트로 판별한 확장자로 만듭니다.
 * 프로필·채팅과 같은 공개 버킷을 쓰므로 URL 조립은 buildPublicFileUrl 한 곳으로 모읍니다.
 */
export async function uploadReviewImage(
  reviewId: number,
  buffer: Buffer,
  { mimeType, extension }: DetectedImageType
): Promise<string> {
  const key = `review/${reviewId}/${randomUUID()}.${extension}`;
  await s3Client.send(
    new PutObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key, Body: buffer, ContentType: mimeType })
  );
  return buildPublicFileUrl(key);
}
