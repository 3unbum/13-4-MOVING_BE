import { AppError } from "../../../common/errors/AppError";
import { ERROR_CODES } from "../../../common/errors/errorCodes";

type ProviderTokenErrorBody = { error?: string };

/**
 * 세 provider 모두 토큰 엔드포인트 에러 응답이 { error, error_description } 형태의
 * OAuth2 표준 에러 코드를 씀 — 그중 명시적 invalid_grant(코드 만료/재사용)만 유저 잘못(401)이고,
 * 나머지(우리 client_secret 오설정, provider 429/5xx, 응답이 JSON이 아닌 경우 등)는
 * provider 쪽 문제(502)로 분류한다.
 */
export const classifyTokenExchangeError = async (
  response: Response,
  providerLabel: string
): Promise<AppError> => {
  const body = (await response.json().catch(() => null)) as ProviderTokenErrorBody | null;

  if (body?.error === "invalid_grant") {
    return new AppError(
      401,
      ERROR_CODES.INVALID_OAUTH_CODE,
      `${providerLabel} 인가 코드가 유효하지 않습니다`
    );
  }
  return new AppError(
    502,
    ERROR_CODES.OAUTH_PROVIDER_ERROR,
    `${providerLabel} 토큰 교환에 실패했습니다`
  );
};
