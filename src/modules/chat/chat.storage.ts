import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { S3_BUCKET_NAME, buildPublicFileUrl, s3Client } from "../../config/s3";
import type { DetectedImageType } from "../../common/utils/fileSignature.util";

/**
 * 채팅 사진 업로드. 파일명은 클라이언트 값이 아니라 실제 바이트로 판별한 확장자로 만듭니다.
 * 프로필 이미지와 같은 버킷·CDN을 쓰므로 URL을 아는 사람은 누구나 볼 수 있습니다(UUID라 추측은 어렵습니다).
 */
export async function uploadChatImage(
  roomId: number,
  buffer: Buffer,
  { mimeType, extension }: DetectedImageType
): Promise<string> {
  const key = `chat/${roomId}/${randomUUID()}.${extension}`;
  await s3Client.send(
    new PutObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key, Body: buffer, ContentType: mimeType })
  );
  return buildPublicFileUrl(key);
}
