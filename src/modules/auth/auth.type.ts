import type { SocialProvider, UserRole } from "../../../generated/prisma/enums.ts";

export interface AuthUser {
  id: number;
  role: UserRole;
  name: string;
  email: string;
}

/**
 * auth.service ↔ auth.controller 간 내부 계약.
 * accessToken/refreshToken은 컨트롤러가 setAuthCookies로 쿠키에 굽고,
 * 응답 body(user, hasProfile)에는 포함하지 않는다.
 */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  hasProfile: boolean;
}

/**
 * POST /auth/oauth/{provider} 응답.
 * 기존 회원이면 바로 로그인 처리, 신규 회원이면 oauthSignupToken을 발급해
 * 프론트가 전화번호 입력 화면으로 이동시키도록 한다.
 */
export type OAuthLoginResult =
  | {
      isNewUser: false;
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
      hasProfile: boolean;
    }
  | {
      isNewUser: true;
      oauthSignupToken: string;
      providerProfile: {
        provider: SocialProvider;
        email: string;
        name: string;
        profileImage: string | null;
      };
    };
