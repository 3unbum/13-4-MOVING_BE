import { customerProfileUpdateSchema, moverProfileUpdateSchema } from "./profile.schema";

const VALID_NEW_PASSWORD = "newPass123!";
const CURRENT_PASSWORD = "currentPass123!";

describe("customerProfileUpdateSchema", () => {
  it("newPassword 없이 이름만 바꾸는 경우 통과한다", () => {
    const result = customerProfileUpdateSchema.safeParse({ name: "홍길동" });
    expect(result.success).toBe(true);
  });

  it("newPassword만 있고 currentPassword가 없으면 실패한다", () => {
    const result = customerProfileUpdateSchema.safeParse({ newPassword: VALID_NEW_PASSWORD });
    expect(result.success).toBe(false);
  });

  it("newPassword와 currentPassword가 다르면 통과한다", () => {
    const result = customerProfileUpdateSchema.safeParse({
      currentPassword: CURRENT_PASSWORD,
      newPassword: VALID_NEW_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  // #91: 새 비밀번호가 현재 비밀번호와 같은 값이면 거부
  it("newPassword가 currentPassword와 같으면 실패한다", () => {
    const result = customerProfileUpdateSchema.safeParse({
      currentPassword: CURRENT_PASSWORD,
      newPassword: CURRENT_PASSWORD,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["newPassword"]);
    }
  });
});

describe("moverProfileUpdateSchema", () => {
  it("newPassword와 currentPassword가 다르면 통과한다", () => {
    const result = moverProfileUpdateSchema.safeParse({
      currentPassword: CURRENT_PASSWORD,
      newPassword: VALID_NEW_PASSWORD,
    });
    expect(result.success).toBe(true);
  });

  // #91: 새 비밀번호가 현재 비밀번호와 같은 값이면 거부
  it("newPassword가 currentPassword와 같으면 실패한다", () => {
    const result = moverProfileUpdateSchema.safeParse({
      currentPassword: CURRENT_PASSWORD,
      newPassword: CURRENT_PASSWORD,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["newPassword"]);
    }
  });
});
