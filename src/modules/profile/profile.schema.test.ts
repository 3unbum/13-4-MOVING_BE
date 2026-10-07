import {
  customerProfileUpdateSchema,
  moverProfileCreateSchema,
  moverProfileUpdateSchema,
  verifyProfileEmailVerificationCodeSchema,
} from "./profile.schema";

const VALID_NEW_PASSWORD = "newPass123!";
const CURRENT_PASSWORD = "currentPass123!";

const VALID_CREATE_BASE = {
  nickName: "닉네임",
  bio: "한 줄 소개",
  description: "상세 설명",
  services: ["SMALL"],
  regions: ["SEOUL"],
};

describe("customerProfileUpdateSchema", () => {
  it("image가 null이면 프로필 이미지 삭제 요청으로 통과한다", () => {
    const result = customerProfileUpdateSchema.safeParse({ image: null });
    expect(result.success).toBe(true);
  });

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

describe("moverProfileCreateSchema", () => {
  it("career가 0~60년이면 통과한다", () => {
    expect(moverProfileCreateSchema.safeParse({ ...VALID_CREATE_BASE, career: 0 }).success).toBe(
      true
    );
    expect(moverProfileCreateSchema.safeParse({ ...VALID_CREATE_BASE, career: 60 }).success).toBe(
      true
    );
  });

  it("career가 음수면 실패한다", () => {
    expect(moverProfileCreateSchema.safeParse({ ...VALID_CREATE_BASE, career: -1 }).success).toBe(
      false
    );
  });

  // 말이 안 되는 경력(예: 50000년)으로 프로필 등록이 가능했던 버그 수정
  it("career가 60년을 넘으면 실패한다", () => {
    const result = moverProfileCreateSchema.safeParse({ ...VALID_CREATE_BASE, career: 50000 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["career"]);
    }
  });
});

describe("moverProfileUpdateSchema", () => {
  it("image가 null이면 프로필 이미지 삭제 요청으로 통과한다", () => {
    const result = moverProfileUpdateSchema.safeParse({ image: null });
    expect(result.success).toBe(true);
  });

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

  it("career가 60년을 넘으면 실패한다", () => {
    const result = moverProfileUpdateSchema.safeParse({ career: 61 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["career"]);
    }
  });

  it("career가 60년이면 통과한다", () => {
    expect(moverProfileUpdateSchema.safeParse({ career: 60 }).success).toBe(true);
  });
});

describe("verifyProfileEmailVerificationCodeSchema", () => {
  it("6자리 숫자면 통과한다", () => {
    expect(verifyProfileEmailVerificationCodeSchema.safeParse({ code: "123456" }).success).toBe(
      true
    );
  });

  it.each([
    ["5자리", "12345"],
    ["7자리", "1234567"],
    ["숫자가 아님", "12345a"],
  ])("%s면 실패한다", (_label, code) => {
    expect(verifyProfileEmailVerificationCodeSchema.safeParse({ code }).success).toBe(false);
  });
});
