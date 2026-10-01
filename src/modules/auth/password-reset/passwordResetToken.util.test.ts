import jwt from "jsonwebtoken";
import { env } from "../../../config/env";
import passwordResetTokenUtil from "./passwordResetToken.util";

describe("passwordResetTokenUtil", () => {
  test("발급한 토큰을 검증하면 userId와 codeId를 그대로 돌려준다", () => {
    // Setup
    const token = passwordResetTokenUtil.create({ userId: 7, codeId: 18 });

    // Exercise
    const payload = passwordResetTokenUtil.verify(token);

    // Assertion
    expect(payload).toEqual({ userId: 7, codeId: 18 });
  });

  test("서명이 조작된 토큰은 검증에 실패한다", () => {
    // Setup
    const token = passwordResetTokenUtil.create({ userId: 7, codeId: 18 });
    const tampered = `${token.slice(0, -3)}abc`;

    // Exercise
    const verify = () => passwordResetTokenUtil.verify(tampered);

    // Assertion
    expect(verify).toThrow();
  });

  test("다른 시크릿으로 서명한 토큰은 검증에 실패한다", () => {
    // Setup: 로그인용 access token 시크릿으로 만든 토큰을 재설정 토큰으로 쓰려는 경우
    const token = jwt.sign({ userId: 7, codeId: 18 }, env.JWT_SECRET);

    // Exercise
    const verify = () => passwordResetTokenUtil.verify(token);

    // Assertion
    expect(verify).toThrow();
  });

  test("만료된 토큰은 검증에 실패한다", () => {
    // Setup
    const token = jwt.sign({ userId: 7, codeId: 18 }, env.PASSWORD_RESET_TOKEN_SECRET, {
      expiresIn: -1,
    });

    // Exercise
    const verify = () => passwordResetTokenUtil.verify(token);

    // Assertion
    expect(verify).toThrow(jwt.TokenExpiredError);
  });

  test("서명은 맞아도 codeId가 없으면 검증에 실패한다", () => {
    // Setup: 1회 사용 판단에 codeId가 꼭 필요하므로 형식이 다른 토큰은 받지 않는다
    const token = jwt.sign({ userId: 7 }, env.PASSWORD_RESET_TOKEN_SECRET);

    // Exercise
    const verify = () => passwordResetTokenUtil.verify(token);

    // Assertion
    expect(verify).toThrow();
  });
});
