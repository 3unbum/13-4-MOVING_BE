import { AppError } from "../../../common/errors/AppError";
import { ERROR_CODES } from "../../../common/errors/errorCodes";
import type { SocialProvider } from "../../../../generated/prisma/enums";
import type { OAuthProviderProfile } from "./oauth.type";
import { googleOAuthProvider } from "./google.provider";
import { kakaoOAuthProvider } from "./kakao.provider";
import { naverOAuthProvider } from "./naver.provider";

export type OAuthProviderName = "google" | "kakao" | "naver";
/** LOCAL을 제외한 SocialProvider — OAuth 플로우엔 LOCAL이 올 수 없음을 타입으로도 보장 */
export type OAuthSocialProvider = Exclude<SocialProvider, "LOCAL">;

const PROVIDER_MAP: Record<OAuthProviderName, OAuthSocialProvider> = {
  google: "GOOGLE",
  kakao: "KAKAO",
  naver: "NAVER",
};

const exchangeHandlers: Record<
  OAuthProviderName,
  (code: string, redirectUri: string) => Promise<OAuthProviderProfile>
> = {
  google: (code, redirectUri) => googleOAuthProvider.exchangeCodeForProfile(code, redirectUri),
  kakao: (code, redirectUri) => kakaoOAuthProvider.exchangeCodeForProfile(code, redirectUri),
  naver: (code) => naverOAuthProvider.exchangeCodeForProfile(code),
};

export const toSocialProvider = (provider: OAuthProviderName): OAuthSocialProvider =>
  PROVIDER_MAP[provider];

/** provider 무관하게 { providerId, email, name, profileImage }로 정규화해 반환합니다. */
export const exchangeOAuthCode = async (
  provider: OAuthProviderName,
  code: string,
  redirectUri: string
): Promise<OAuthProviderProfile> => {
  try {
    return await exchangeHandlers[provider](code, redirectUri);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      ERROR_CODES.OAUTH_PROVIDER_ERROR,
      "소셜 로그인 처리 중 오류가 발생했습니다"
    );
  }
};
