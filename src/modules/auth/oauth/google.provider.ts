import { env } from "../../../config/env";
import { AppError } from "../../../common/errors/AppError";
import { ERROR_CODES } from "../../../common/errors/errorCodes";
import type { OAuthProviderProfile } from "./oauth.type";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PROFILE_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

type GoogleTokenResponse = {
  access_token: string;
};

type GoogleProfileResponse = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

const exchangeCode = async (code: string, redirectUri: string): Promise<string> => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new AppError(401, ERROR_CODES.INVALID_OAUTH_CODE, "구글 인가 코드가 유효하지 않습니다");
  }

  const data = (await response.json()) as GoogleTokenResponse;
  return data.access_token;
};

const fetchProfile = async (accessToken: string): Promise<GoogleProfileResponse> => {
  const response = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new AppError(502, ERROR_CODES.OAUTH_PROVIDER_ERROR, "구글 프로필 조회에 실패했습니다");
  }

  return (await response.json()) as GoogleProfileResponse;
};

export const googleOAuthProvider = {
  async exchangeCodeForProfile(code: string, redirectUri: string): Promise<OAuthProviderProfile> {
    const accessToken = await exchangeCode(code, redirectUri);
    const profile = await fetchProfile(accessToken);

    return {
      providerId: profile.sub,
      email: profile.email,
      name: profile.name ?? "",
      profileImage: profile.picture ?? null,
    };
  },
};
