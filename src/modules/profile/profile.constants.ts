export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
// 프로필 이미지 업로드 최대 용량: 5MB
export const PROFILE_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function isAllowedImageMimeType(mimeType: string): boolean {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

// 프로필 수정 진입 이메일 인증번호
export const PROFILE_EDIT_CODE_TTL_MINUTES = 5;
export const PROFILE_EDIT_CODE_MAX_FAILED_ATTEMPTS = 5;
// 인증 성공 후 계정 정보(이름·전화번호·비밀번호) 수정을 허용하는 시간(분) — ProfileEditVerificationCode.usedAt 기준
export const PROFILE_EDIT_VERIFIED_TTL_MINUTES = 30;
