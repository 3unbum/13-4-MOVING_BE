import { createHash } from "node:crypto";
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

describe("hashResetCode / compareResetCode", () => {
  test("같은 인증번호면 항상 같은 해시를 만들고, 키 없는 sha256과는 다른 값이다", () => {
    // Setup
    const code = "482913";
    const plainSha256 = createHash("sha256").update(code).digest("hex");

    // Exercise
    const hashed1 = hashUtil.hashResetCode(code);
    const hashed2 = hashUtil.hashResetCode(code);

    // Assertion: 서버 키가 섞였으므로 DB만 가진 사람이 sha256으로 100만 개를 계산해도 맞출 수 없다
    expect(hashed1).toBe(hashed2);
    expect(hashed1).not.toBe(plainSha256);
  });

  test("같은 인증번호면 compareResetCode가 true, 한 자리라도 다르면 false를 반환한다", () => {
    // Setup
    const hashed = hashUtil.hashResetCode("482913");

    // Exercise
    const same = hashUtil.compareResetCode("482913", hashed);
    const different = hashUtil.compareResetCode("482914", hashed);

    // Assertion
    expect(same).toBe(true);
    expect(different).toBe(false);
  });

  test("저장된 해시의 길이가 비정상이어도 에러 없이 false를 반환한다", () => {
    // timingSafeEqual은 길이가 다르면 예외를 던지므로 길이 확인이 먼저 막아야 한다

    // Exercise
    const isMatch = hashUtil.compareResetCode("482913", "broken-hash");

    // Assertion
    expect(isMatch).toBe(false);
  });
});
