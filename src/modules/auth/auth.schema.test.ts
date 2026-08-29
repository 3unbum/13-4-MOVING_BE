import { signupSchema } from "./auth.schema";

describe("signupSchema", () => {
  const valid = {
    role: "CUSTOMER",
    name: "김코드",
    email: "test@moving.com",
    phoneNumber: "01012345678",
    password: "Test1234!",
  };

  it("올바른 입력을 통과시킨다", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("이메일 형식이 아니면 실패한다", () => {
    const result = signupSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("비밀번호가 8자 미만이면 실패한다", () => {
    const result = signupSchema.safeParse({ ...valid, password: "Ab1!" });
    expect(result.success).toBe(false);
  });

  it("비밀번호에 특수문자가 없으면 실패한다", () => {
    const result = signupSchema.safeParse({ ...valid, password: "Test12345" });
    expect(result.success).toBe(false);
  });
});
