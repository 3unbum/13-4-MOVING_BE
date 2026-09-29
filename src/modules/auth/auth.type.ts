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
 * 아이디 찾기 응답. 소셜 계정도 포함해 "가입한 적 없다"고 오해해 중복 가입하는 것을 막습니다.
 * email은 마스킹된 값입니다.
 */
export interface FindEmailResult {
  accounts: { email: string; provider: SocialProvider }[];
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
