import type { UserRole } from "../../../generated/prisma/enums.ts";

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
