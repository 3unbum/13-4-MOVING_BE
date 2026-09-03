export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
// 요구사항 문서에 최대 용량 명시가 없어 5MB로 잠정 설정 (팀 확정 필요)
export const PROFILE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function isAllowedImageMimeType(mimeType: string): boolean {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}
