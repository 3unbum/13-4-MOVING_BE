import "dotenv/config";

/**
 * 환경변수를 한곳에서 검증해 내보냅니다.
 * process.env를 여기저기서 직접 읽으면 오타가 undefined로 조용히 흘러가
 * 엉뚱한 곳에서 터지므로, 서버 시작 시점에 바로 실패시킵니다.
 */
function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다. .env를 확인하세요.`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: Number(optional("PORT", "3001")),

  DATABASE_URL: required("DATABASE_URL"),

  AWS_REGION: required("AWS_REGION"),
  AWS_ACCESS_KEY_ID: required("AWS_ACCESS_KEY_ID"),
  AWS_SECRET_ACCESS_KEY: required("AWS_SECRET_ACCESS_KEY"),
  AWS_PUBLIC_BUCKET_NAME: required("AWS_PUBLIC_BUCKET_NAME"),

  JWT_SECRET: required("JWT_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_EXPIRES_IN: optional("JWT_EXPIRES_IN", "1h"),
  JWT_REFRESH_EXPIRES_IN: optional("JWT_REFRESH_EXPIRES_IN", "14d"),

  CLIENT_URL: optional("CLIENT_URL", "http://localhost:3000"),

  /** OAuth 신규가입 2단계 임시 토큰. 세 provider 공용이라 JWT_SECRET급으로 필수 취급합니다. */
  OAUTH_SIGNUP_TOKEN_SECRET: required("OAUTH_SIGNUP_TOKEN_SECRET"),
  OAUTH_SIGNUP_TOKEN_EXPIRES_IN: optional("OAUTH_SIGNUP_TOKEN_EXPIRES_IN", "10m"),

  /**
   * provider별 자격증명은 optional로 둡니다 — 필수로 두면 하나라도 콘솔 등록 전엔
   * 다른 도메인 담당자의 서버 기동까지 막혀버립니다. 값이 비어있으면 해당 provider
   * 라우트 호출 시점에 자연스럽게 실패합니다(빈 client_id로 provider가 토큰 교환 거부).
   */
  GOOGLE_CLIENT_ID: optional("GOOGLE_CLIENT_ID", ""),
  GOOGLE_CLIENT_SECRET: optional("GOOGLE_CLIENT_SECRET", ""),
  NAVER_CLIENT_ID: optional("NAVER_CLIENT_ID", ""),
  NAVER_CLIENT_SECRET: optional("NAVER_CLIENT_SECRET", ""),
  KAKAO_CLIENT_ID: optional("KAKAO_CLIENT_ID", ""),
  KAKAO_CLIENT_SECRET: optional("KAKAO_CLIENT_SECRET", ""),

  /**
   * 비밀번호 재설정 인증번호 발송용 Gmail 계정. OAuth 자격증명과 같은 이유로 optional —
   * 비어있으면 서버는 뜨고, 메일 발송 시점에만 Gmail 인증 실패로 떨어집니다.
   * SMTP_PASS는 Gmail 로그인 비밀번호가 아니라 앱 비밀번호(16자리)입니다.
   */
  SMTP_USER: optional("SMTP_USER", ""),
  SMTP_PASS: optional("SMTP_PASS", ""),
} as const;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
