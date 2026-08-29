import type { SignupDto, LoginDto } from "./auth.schema";
import type { AuthResult } from "./auth.type";

export const authService = {
  async signup(_dto: SignupDto): Promise<AuthResult> {
    // TODO: 이메일 중복 확인 → bcrypt 해싱 → user 생성 → 토큰 발급
    throw new Error("not implemented");
  },

  async login(_dto: LoginDto): Promise<AuthResult> {
    // TODO: 유저 조회 → bcrypt.compare → 토큰 발급
    throw new Error("not implemented");
  },
};
