import hashUtil from "./hash.util";
import { ERROR_CODES } from "../errors/errorCodes";

describe("hashPassword / verifyPassword", () => {
  test("해싱한 비밀번호는 원문과 다르지만 verifyPassword로 검증하면 통과한다", async () => {
    // Setup
    const password = "Test1234!";

    // Exercise
    const hashed = await hashUtil.hashPassword(password);
    const isValid = await hashUtil.verifyPassword(password, hashed);

    // Assertion
    expect(hashed).not.toBe(password);
    expect(isValid).toBe(true);
  });

  test("다른 비밀번호로 검증하면 실패한다", async () => {
    // Setup
    const hashed = await hashUtil.hashPassword("Test1234!");

    // Exercise
    const isValid = await hashUtil.verifyPassword("Wrong1234!", hashed);

    // Assertion
    expect(isValid).toBe(false);
  });

  test("72바이트를 초과하는 비밀번호는 해싱 시 400 에러를 던진다", async () => {
    // Setup
    const tooLongPassword = "a".repeat(73);

    // Exercise
    const result = hashUtil.hashPassword(tooLongPassword);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  });

  /** BCRYPT_MAX_BYTES는 문자 수가 아니라 UTF-8 바이트 수 기준이다. 한글 1자 = 3바이트 */
  test("문자 수는 적어도 UTF-8 바이트 수가 72바이트를 넘으면 400 에러를 던진다", async () => {
    // Setup
    const password = "가".repeat(25);

    // Exercise
    const result = hashUtil.hashPassword(password);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  });

  test("72바이트를 초과하는 비밀번호는 검증 시 에러 없이 false를 반환한다", async () => {
    // Setup
    const hashed = await hashUtil.hashPassword("Test1234!");
    const tooLongPassword = "a".repeat(73);

    // Exercise
    const isValid = await hashUtil.verifyPassword(tooLongPassword, hashed);

    // Assertion
    expect(isValid).toBe(false);
  });
});

describe("hashRefreshToken / compareRefreshToken", () => {
  test("같은 리프레시 토큰이면 항상 같은 해시를 생성한다", () => {
    // Setup
    const token = "some-refresh-token";

    // Exercise
    const hashed1 = hashUtil.hashRefreshToken(token);
    const hashed2 = hashUtil.hashRefreshToken(token);

    // Assertion
    expect(hashed1).toBe(hashed2);
  });

  test("같은 리프레시 토큰이면 compareRefreshToken이 true를 반환한다", () => {
    // Setup
    const token = "some-refresh-token";
    const hashed = hashUtil.hashRefreshToken(token);

    // Exercise
    const isMatch = hashUtil.compareRefreshToken(token, hashed);

    // Assertion
    expect(isMatch).toBe(true);
  });

  test("다른 리프레시 토큰이면 compareRefreshToken이 false를 반환한다", () => {
    // Setup
    const hashed = hashUtil.hashRefreshToken("token-a");

    // Exercise
    const isMatch = hashUtil.compareRefreshToken("token-b", hashed);

    // Assertion
    expect(isMatch).toBe(false);
  });
});
