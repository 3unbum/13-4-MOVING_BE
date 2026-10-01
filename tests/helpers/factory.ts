/**
 * 테스트용 더미 데이터 생성 헬퍼.
 * 각 팀이 필요한 팩토리를 여기에 추가하세요.
 */

export function makeUserInput(overrides: Partial<{
  role: "CUSTOMER" | "MOVER";
  name: string;
  email: string;
  phoneNumber: string;
  password: string;
}> = {}) {
  return {
    role: "CUSTOMER" as const,
    name: "김코드",
    email: `test-${Date.now()}@moving.com`,
    phoneNumber: "01012345678",
    password: "Test1234!",
    ...overrides,
  };
}
