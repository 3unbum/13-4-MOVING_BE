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

  JWT_SECRET: required("JWT_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_EXPIRES_IN: optional("JWT_EXPIRES_IN", "1h"),
  JWT_REFRESH_EXPIRES_IN: optional("JWT_REFRESH_EXPIRES_IN", "14d"),

  CLIENT_URL: optional("CLIENT_URL", "http://localhost:3000"),
} as const;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
