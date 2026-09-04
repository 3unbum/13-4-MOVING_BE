import { env } from "../../../config/env";
import { AppError } from "../../../common/errors/AppError";
import { ERROR_CODES } from "../../../common/errors/errorCodes";
import { classifyTokenExchangeError } from "./oauthTokenError.util";
import type { OAuthProviderProfile } from "./oauth.type";

const TOKEN_URL = "https://nid.naver.com/oauth2.0/token";
const PROFILE_URL = "https://openapi.naver.com/v1/nid/me";

type NaverTokenResponse = {
  access_token: string;
};

type NaverProfileResponse = {
  resultcode: string;
  message: string;
  response?: {
    id: string;
    email?: string;
    name?: string;
    profile_image?: string;
  };
};

/** 네이버는 토큰 교환 시 redirect_uri가 필요 없습니다 (client_id/secret/code만) */
const exchangeCode = async (code: string): Promise<string> => {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.NAVER_CLIENT_ID,
    client_secret: env.NAVER_CLIENT_SECRET,
    code,
  });

  const response = await fetch(`${TOKEN_URL}?${params.toString()}`);

  if (!response.ok) {
    throw await classifyTokenExchangeError(response, "네이버");
  }

  const data = (await response.json()) as NaverTokenResponse;
  return data.access_token;
};

const fetchProfile = async (accessToken: string): Promise<Required<NaverProfileResponse>["response"]> => {
  const response = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await response.json()) as NaverProfileResponse;

  if (!response.ok || data.resultcode !== "00" || !data.response) {
    throw new AppError(502, ERROR_CODES.OAUTH_PROVIDER_ERROR, "네이버 프로필 조회에 실패했습니다");
  }

  return data.response;
};

export const naverOAuthProvider = {
  async exchangeCodeForProfile(code: string): Promise<OAuthProviderProfile> {
    const accessToken = await exchangeCode(code);
    const profile = await fetchProfile(accessToken);

    return {
      providerId: profile.id,
      email: profile.email ?? "",
      name: profile.name ?? "",
      profileImage: profile.profile_image ?? null,
    };
  },
};
