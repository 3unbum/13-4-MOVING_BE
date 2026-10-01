import { moverProfileCreateSchema, moverProfileUpdateSchema } from "./profile.schema";

const VALID_CREATE_BASE = {
  nickName: "닉네임",
  bio: "한 줄 소개",
  description: "상세 설명",
  services: ["SMALL"],
  regions: ["SEOUL"],
};

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
