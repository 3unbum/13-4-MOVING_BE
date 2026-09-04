import { env } from "../../../config/env";
import { AppError } from "../../../common/errors/AppError";
import { ERROR_CODES } from "../../../common/errors/errorCodes";
import type { OAuthProviderProfile } from "./types";

const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const PROFILE_URL = "https://kapi.kakao.com/v2/user/me";

interface KakaoTokenResponse {
  access_token: string;
}

interface KakaoProfileResponse {
  id: number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
}

const exchangeCode = async (code: string, redirectUri: string): Promise<string> => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.KAKAO_CLIENT_ID,
      client_secret: env.KAKAO_CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!response.ok) {
    throw new AppError(401, ERROR_CODES.INVALID_OAUTH_CODE, "카카오 인가 코드가 유효하지 않습니다");
  }

  const data = (await response.json()) as KakaoTokenResponse;
  return data.access_token;
};

const fetchProfile = async (accessToken: string): Promise<KakaoProfileResponse> => {
  const response = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new AppError(502, ERROR_CODES.OAUTH_PROVIDER_ERROR, "카카오 프로필 조회에 실패했습니다");
  }

  return (await response.json()) as KakaoProfileResponse;
};

export const kakaoOAuthProvider = {
  async exchangeCodeForProfile(code: string, redirectUri: string): Promise<OAuthProviderProfile> {
    const accessToken = await exchangeCode(code, redirectUri);
    const profile = await fetchProfile(accessToken);

    return {
      providerId: String(profile.id),
      email: profile.kakao_account?.email ?? "",
      name: profile.kakao_account?.profile?.nickname ?? "",
      profileImage: profile.kakao_account?.profile?.profile_image_url ?? null,
    };
  },
};
