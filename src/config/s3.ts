import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export const S3_BUCKET_NAME = env.AWS_PUBLIC_BUCKET_NAME;

/**
 * 업로드한 파일의 공개 URL을 만듭니다.
 *
 * `CDN_URL`이 있으면 CloudFront를 거칩니다. 운영 버킷은 퍼블릭 액세스를 차단하고
 * CloudFront(OAC)에만 읽기를 허용하므로, 배포 환경에서는 **이 경로가 유일한 입구**입니다.
 *
 * 값이 없으면 S3 직접 URL로 떨어집니다 — CDN 설정 전이나 퍼블릭 버킷을 쓰는
 * 로컬 환경에서도 동작하게 두려는 폴백입니다.
 *
 * ⚠️ 지금은 DB에 이 **전체 URL**이 저장됩니다. 교안 기준으로는 key만 저장하고
 * 응답할 때 URL을 만드는 쪽이 맞지만, 그러려면 스키마와 FE 계약을 함께 바꿔야 합니다.
 * 그때 고칠 지점이 여기 한 곳이 되도록 URL 조립을 모아뒀습니다.
 */
export function buildPublicFileUrl(key: string): string {
  if (env.CDN_URL) {
    // 환경변수 끝에 슬래시가 붙어 와도 `//`가 되지 않게 다듬습니다.
    return `${env.CDN_URL.replace(/\/+$/, "")}/${key}`;
  }
  return `https://${S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}
