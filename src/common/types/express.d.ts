/**
 * Express Request 타입 확장.
 * passport 인증 통과 후 req.user에 주입되는 값입니다.
 *
 * 주의: 이 파일에 top-level import/export를 쓰면 모듈로 취급되어
 * 전역 확장이 적용되지 않습니다. 타입은 인라인으로 참조하세요.
 */
declare namespace Express {
  interface User {
    id: number;
    role: import("./role").UserRole;
  }

  interface Request {
    user?: User;
  }
}
