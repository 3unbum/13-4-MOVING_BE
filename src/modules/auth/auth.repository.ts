import { prisma } from "../../config/prisma";
import type { UserRole } from "../../common/types/role";

export const authRepository = {
  /**
   * (role, email) 복합 유니크로 조회합니다.
   * 같은 이메일로 일반 유저·기사님 각각 가입할 수 있습니다.
   */
  findByEmailAndRole(_email: string, _role: UserRole) {
    // TODO: 스키마 작성 후 구현
    // return prisma.user.findUnique({ where: { role_email: { role, email } } });
    void prisma;
    return null;
  },
};
