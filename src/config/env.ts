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

  /** CORS 허용 origin. **쉼표로 여러 개**를 넣을 수 있습니다 (`app.ts` 에서 분리). */
  CLIENT_URL: optional("CLIENT_URL", "http://localhost:3000"),

  /** OAuth 신규가입 2단계 임시 토큰. 세 provider 공용이라 JWT_SECRET급으로 필수 취급합니다. */
  OAUTH_SIGNUP_TOKEN_SECRET: required("OAUTH_SIGNUP_TOKEN_SECRET"),
  OAUTH_SIGNUP_TOKEN_EXPIRES_IN: optional("OAUTH_SIGNUP_TOKEN_EXPIRES_IN", "10m"),

  PASSWORD_RESET_TOKEN_SECRET: required("PASSWORD_RESET_TOKEN_SECRET"),
  PASSWORD_RESET_TOKEN_EXPIRES_IN: optional("PASSWORD_RESET_TOKEN_EXPIRES_IN", "10m"),
  /** 비어 있어도 HMAC이 에러 없이 계산돼 보안만 약해지므로 required */
  PASSWORD_RESET_CODE_SECRET: required("PASSWORD_RESET_CODE_SECRET"),

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

  SMTP_USER: optional("SMTP_USER", ""),
  SMTP_PASS: optional("SMTP_PASS", ""),

  /**
   * CloudFront 배포 도메인 (예: `https://dxxxx.cloudfront.net`).
   *
   * 비어 있으면 S3 직접 URL로 떨어집니다 — CDN 설정 전이나 로컬 개발에서도 동작합니다.
   * ⚠️ 운영 버킷은 퍼블릭 액세스를 차단했으므로, 배포 환경에서 이 값이 비면
   * 이미지가 403이 됩니다. Secrets의 `ENV`에 반드시 넣으세요.
   */
  CDN_URL: optional("CDN_URL", ""),

  /**
   * Sentry DSN. 비어 있으면 Sentry를 초기화하지 않습니다.
   *
   * 로컬 개발·CI에서는 값이 없으니 자동으로 꺼지고, 배포 환경에만 Secrets로 주입합니다.
   * 필수로 두면 DSN을 모르는 팀원의 서버 기동까지 막히므로 optional입니다.
   */
  SENTRY_DSN: optional("SENTRY_DSN", ""),

  /**
   * Cloudflare Turnstile 시크릿 키. 비어 있으면 봇 검증을 건너뜁니다.
   *
   * 로컬 개발·CI에서는 값이 없어도 로그인이 되도록 optional입니다.
   * ⚠️ 배포 환경에서 이 값이 비면 봇 검증이 조용히 꺼지니 Secrets의 `ENV`에 반드시 넣으세요.
   */
  TURNSTILE_SECRET_KEY: optional("TURNSTILE_SECRET_KEY", ""),

  /**
   * 토스페이먼츠 시크릿 키(`test_sk_...` / `test_gsk_...`). 비어 있으면 승인 API 호출을 건너뛰고
   * 견적을 바로 결제 완료 처리합니다 (로컬·CI).
   *
   * 테스트 키로는 실제 청구가 일어나지 않습니다. 시크릿 키는 서버에서만 쓰고 FE에 내려주지 마세요.
   * ⚠️ 배포 환경에서 이 값이 비면 토스 승인 없이 결제가 처리되니 Secrets의 `ENV`에 반드시 넣으세요.
   */
  TOSS_SECRET_KEY: optional("TOSS_SECRET_KEY", ""),
} as const;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
