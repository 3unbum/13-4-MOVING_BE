/** 비밀번호 재설정 인증번호 유효시간. 메일 문구에도 이 값이 들어갑니다. */
export const RESET_CODE_TTL_MINUTES = 5;

/**
 * 인증번호 하나에 허용하는 틀린 입력 횟수. 넘으면 그 코드만 무효가 되고 재발송으로 이어갑니다.
 * 추측 상한은 발송 limiter(시간당 5개)와 곱해져 시간당 25번입니다.
 */
export const RESET_CODE_MAX_FAILED_ATTEMPTS = 5;
