export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
// 프로필 이미지 업로드 최대 용량: 5MB
export const PROFILE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function isAllowedImageMimeType(mimeType: string): boolean {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}
