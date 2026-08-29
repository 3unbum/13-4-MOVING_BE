import type { UserRole } from "../../common/types/role";

export interface AuthUser {
  id: number;
  role: UserRole;
  name: string;
  email: string;
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
  hasProfile: boolean;
}
