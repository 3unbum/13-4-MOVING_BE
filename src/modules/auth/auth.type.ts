import type { UserRole } from "../../../generated/prisma/enums.ts";

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
