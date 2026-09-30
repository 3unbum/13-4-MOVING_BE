import { Prisma } from "../../../generated/prisma/client";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { authService } from "./auth.service";
import { authRepository } from "./auth.repository";
import hashUtil from "../../common/utils/hash.util";
import jwtUtil from "../../common/utils/jwt.util";
import { exchangeOAuthCode, toSocialProvider } from "./oauth/dispatcher";
import oauthSignupTokenUtil from "./oauth/oauthSignupToken.util";
import passwordResetTokenUtil from "./password-reset/passwordResetToken.util";
import { mailer } from "../../config/mailer";

/**
 * generated/prisma/client의 실제 모듈은 tsconfig의 rewriteRelativeImportExtensions로 인해
 * ts-jest에서 내부 상대 import(.ts -> .js 재작성) resolve가 깨진다.
 * auth.service.ts가 P2002 판별에 필요로 하는 PrismaClientKnownRequestError만 최소로 흉내낸다.
 */
jest.mock("../../../generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, opts: { code: string; clientVersion: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));

jest.mock("./auth.repository", () => ({
  authRepository: {
    findByEmailAndRole: jest.fn(),
    findBySocialAndRole: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateRefreshToken: jest.fn(),
    existsByEmailAndRole: jest.fn(),
    findAccountsByNameAndPhone: jest.fn(),
    replacePasswordResetCode: jest.fn(),
    findPasswordResetCodeByUserId: jest.fn(),
    incrementResetCodeFailedAttempts: jest.fn(),
    completePasswordReset: jest.fn(),
  },
}));

jest.mock("../../common/utils/hash.util", () => ({
  __esModule: true,
  default: {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
    hashRefreshToken: jest.fn(),
    compareRefreshToken: jest.fn(),
    hashResetCode: jest.fn(),
    compareResetCode: jest.fn(),
  },
}));

// 실제 Gmail로 나가지 않도록 발송기를 흉내낸다
jest.mock("../../config/mailer", () => ({
  mailer: { sendMail: jest.fn() },
  MAIL_FROM: '"무빙" <noreply@test.com>',
}));

// react-email의 render는 내부에서 dynamic import를 써서 Jest(--experimental-vm-modules 없이)에서 실행되지 않는다
jest.mock("@react-email/components", () => ({
  render: async () => "<html>rendered</html>",
}));

jest.mock("./password-reset/passwordResetToken.util", () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    verify: jest.fn(),
  },
}));

jest.mock("../../common/utils/jwt.util", () => ({
  __esModule: true,
  default: {
    createToken: jest.fn(),
    verifyToken: jest.fn(),
  },
}));

jest.mock("./oauth/dispatcher", () => ({
  exchangeOAuthCode: jest.fn(),
  toSocialProvider: jest.fn(),
}));

jest.mock("./oauth/oauthSignupToken.util", () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    verify: jest.fn(),
  },
}));

const mockedRepository = jest.mocked(authRepository);
const mockedHashUtil = jest.mocked(hashUtil);
const mockedJwtUtil = jest.mocked(jwtUtil);
const mockedExchangeOAuthCode = jest.mocked(exchangeOAuthCode);
const mockedToSocialProvider = jest.mocked(toSocialProvider);
const mockedOauthSignupTokenUtil = jest.mocked(oauthSignupTokenUtil);
const mockedPasswordResetTokenUtil = jest.mocked(passwordResetTokenUtil);
const mockedMailer = jest.mocked(mailer);

/** P2002는 인스턴스 자체를 만들어 instanceof 검사를 실제로 통과시킨다 */
function makeP2002Error() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

function makeUser(overrides = {}) {
  return {
    id: 1,
    role: "CUSTOMER",
    name: "김코드",
    email: "test@moving.com",
    password: "hashed-password",
    refreshToken: null,
    customerProfile: null,
    moverProfile: null,
    ...overrides,
  };
}

// Setup/Teardown: 모든 테스트가 공유하는 mock을 매 테스트 전에 초기화하고 공통 반환값을 다시 세팅한다.
// (테스트 케이스별로 별도 정리할 리소스는 없어 각 test 안에는 Teardown 단계를 따로 두지 않는다)
beforeEach(() => {
  jest.clearAllMocks();
  // access/refresh를 구분해서 반환해야 발급된 토큰이 뒤바뀌지 않았는지 검증할 수 있다
  mockedJwtUtil.createToken.mockImplementation((_userId, _role, type) => `${type}-token`);
  mockedHashUtil.hashRefreshToken.mockReturnValue("hashed-refresh-token");
});

describe("authService.signup", () => {
  const dto = {
    role: "CUSTOMER" as const,
    name: "김코드",
    email: "test@moving.com",
    phoneNumber: "01012345678",
    password: "Test1234!",
  };

  test("신규 유저를 생성하고 토큰을 발급한다", async () => {
    // Setup
    mockedRepository.findByEmailAndRole.mockResolvedValue(null);
    mockedHashUtil.hashPassword.mockResolvedValue("hashed-password");
    mockedRepository.create.mockResolvedValue(makeUser() as never);

    // Exercise
    const result = await authService.signup(dto);

    // Assertion
    expect(mockedRepository.create).toHaveBeenCalledWith({
      role: "CUSTOMER",
      name: "김코드",
      email: "test@moving.com",
      phoneNumber: "01012345678",
      password: "hashed-password",
      provider: "LOCAL",
    });
    expect(result.hasProfile).toBe(false);
    expect(result.user).toEqual({ id: 1, role: "CUSTOMER", name: "김코드", email: "test@moving.com" });
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(mockedJwtUtil.createToken).toHaveBeenCalledWith(1, "CUSTOMER", "access");
    expect(mockedJwtUtil.createToken).toHaveBeenCalledWith(1, "CUSTOMER", "refresh");
    expect(mockedHashUtil.hashRefreshToken).toHaveBeenCalledWith("refresh-token");
    expect(mockedRepository.updateRefreshToken).toHaveBeenCalledWith(1, "hashed-refresh-token");
  });

  test("이미 가입된 이메일이면 409를 던지고 생성하지 않는다", async () => {
    // Setup
    mockedRepository.findByEmailAndRole.mockResolvedValue(makeUser() as never);

    // Exercise
    const result = authService.signup(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
    });
    expect(mockedRepository.create).not.toHaveBeenCalled();
  });

  test("거의 동시에 같은 이메일로 가입 요청이 겹치면 409를 던진다", async () => {
    // Setup
    mockedRepository.findByEmailAndRole.mockResolvedValue(null);
    mockedHashUtil.hashPassword.mockResolvedValue("hashed-password");
    mockedRepository.create.mockRejectedValue(makeP2002Error());

    // Exercise
    const result = authService.signup(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
    });
  });

  test("이메일 중복이 아닌 다른 이유로 저장이 실패하면 에러를 그대로 전파한다", async () => {
    // Setup
    mockedRepository.findByEmailAndRole.mockResolvedValue(null);
    mockedHashUtil.hashPassword.mockResolvedValue("hashed-password");
    const unknownError = new Error("db down");
    mockedRepository.create.mockRejectedValue(unknownError);

    // Exercise
    const result = authService.signup(dto);

    // Assertion
    await expect(result).rejects.toBe(unknownError);
  });
});

describe("authService.login", () => {
  const dto = { role: "CUSTOMER" as const, email: "test@moving.com", password: "Test1234!" };

  test("이메일과 비밀번호가 맞으면 로그인 처리하고 프로필 여부를 반환한다", async () => {
    // Setup
    mockedRepository.findByEmailAndRole.mockResolvedValue(
      makeUser({ customerProfile: { id: 10 } }) as never
    );
    mockedHashUtil.verifyPassword.mockResolvedValue(true);

    // Exercise
    const result = await authService.login(dto);

    // Assertion
    expect(result.hasProfile).toBe(true);
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(mockedRepository.updateRefreshToken).toHaveBeenCalledWith(1, "hashed-refresh-token");
  });

  test("프로필을 아직 등록하지 않았으면 hasProfile: false를 반환한다", async () => {
    // Setup
    mockedRepository.findByEmailAndRole.mockResolvedValue(makeUser() as never);
    mockedHashUtil.verifyPassword.mockResolvedValue(true);

    // Exercise
    const result = await authService.login(dto);

    // Assertion
    expect(result.hasProfile).toBe(false);
  });

  test("가입되지 않은 이메일이면 401을 던진다", async () => {
    // Setup
    mockedRepository.findByEmailAndRole.mockResolvedValue(null);

    // Exercise
    const result = authService.login(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS,
    });
  });

  /**
   * findByEmailAndRole는 provider: "LOCAL"로만 조회하고 LOCAL 가입은 항상 비밀번호를 저장하므로
   * 실제로는 도달하지 않는 경로다. password가 nullable 타입이라 존재하는 방어 코드를 검증한다.
   */
  test("password가 없는 방어 코드 케이스도 401을 던진다", async () => {
    // Setup
    mockedRepository.findByEmailAndRole.mockResolvedValue(makeUser({ password: null }) as never);

    // Exercise
    const result = authService.login(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS,
    });
  });

  test("비밀번호가 틀리면 401을 던진다", async () => {
    // Setup
    mockedRepository.findByEmailAndRole.mockResolvedValue(makeUser() as never);
    mockedHashUtil.verifyPassword.mockResolvedValue(false);

    // Exercise
    const result = authService.login(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_CREDENTIALS,
    });
  });
});

describe("authService.logout", () => {
  test("리프레시 토큰이 유효하면 DB에 저장된 refreshToken을 null로 지운다", async () => {
    // Setup
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "CUSTOMER" });
    mockedRepository.findById.mockResolvedValue(makeUser({ refreshToken: "stored-hash" }) as never);
    mockedHashUtil.compareRefreshToken.mockReturnValue(true);

    // Exercise
    await authService.logout("refresh-token");

    // Assertion
    expect(mockedJwtUtil.verifyToken).toHaveBeenCalledWith("refresh-token", "refresh", {
      ignoreExpiration: true,
    });
    expect(mockedRepository.updateRefreshToken).toHaveBeenCalledWith(1, null);
  });

  /**
   * 로그아웃(DB 정리)은 refreshToken 자체가 만료됐어도 허용해야 하므로 ignoreExpiration: true로 검증한다.
   * jwt.verify는 이 옵션이 true면 만료된 토큰에도 TokenExpiredError를 던지지 않으므로,
   * verifyToken을 옵션값에 따라 분기시켜 실제 만료 토큰이 통과하는 상황을 흉내낸다.
   */
  test("만료됐지만 서명은 유효한 토큰도 통과시켜 로그아웃(정리)까지 완료한다", async () => {
    // Setup
    mockedJwtUtil.verifyToken.mockImplementation((_token, _type, options) => {
      if (!options?.ignoreExpiration) {
        const expiredError = new Error("jwt expired");
        expiredError.name = "TokenExpiredError";
        throw expiredError;
      }
      return { userId: 1, role: "CUSTOMER" };
    });
    mockedRepository.findById.mockResolvedValue(makeUser({ refreshToken: "stored-hash" }) as never);
    mockedHashUtil.compareRefreshToken.mockReturnValue(true);

    // Exercise
    await authService.logout("expired-refresh-token");

    // Assertion
    expect(mockedJwtUtil.verifyToken).toHaveBeenCalledWith("expired-refresh-token", "refresh", {
      ignoreExpiration: true,
    });
    expect(mockedRepository.updateRefreshToken).toHaveBeenCalledWith(1, null);
  });

  test("리프레시 토큰 서명이 유효하지 않으면 REFRESH_TOKEN_INVALID를 던진다", async () => {
    // Setup
    mockedJwtUtil.verifyToken.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    // Exercise
    const result = authService.logout("refresh-token");

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.REFRESH_TOKEN_INVALID,
    });
  });

  test("이미 로그아웃되어 저장된 리프레시 토큰 해시가 없으면 REFRESH_TOKEN_INVALID를 던진다", async () => {
    // Setup
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "CUSTOMER" });
    mockedRepository.findById.mockResolvedValue(makeUser({ refreshToken: null }) as never);

    // Exercise
    const result = authService.logout("refresh-token");

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.REFRESH_TOKEN_INVALID,
    });
  });

  /** refreshToken 발급 이후 회원 탈퇴 등으로 유저 자체가 사라진 경우도 같은 오류로 처리한다 */
  test("리프레시 토큰 발급 이후 유저가 삭제됐으면 REFRESH_TOKEN_INVALID를 던진다", async () => {
    // Setup
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "CUSTOMER" });
    mockedRepository.findById.mockResolvedValue(null);

    // Exercise
    const result = authService.logout("refresh-token");

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.REFRESH_TOKEN_INVALID,
    });
  });

  test("리프레시 토큰이 DB에 저장된 해시와 다르면 REFRESH_TOKEN_INVALID를 던진다", async () => {
    // Setup
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "CUSTOMER" });
    mockedRepository.findById.mockResolvedValue(makeUser({ refreshToken: "stored-hash" }) as never);
    mockedHashUtil.compareRefreshToken.mockReturnValue(false);

    // Exercise
    const result = authService.logout("refresh-token");

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.REFRESH_TOKEN_INVALID,
    });
  });
});

describe("authService.refresh", () => {
  test("리프레시 토큰 만료 여부를 무시하지 않고 검증한 뒤 accessToken만 새로 발급한다", async () => {
    // Setup
    mockedJwtUtil.verifyToken.mockReturnValue({ userId: 1, role: "CUSTOMER" });
    mockedRepository.findById.mockResolvedValue(makeUser({ refreshToken: "stored-hash" }) as never);
    mockedHashUtil.compareRefreshToken.mockReturnValue(true);

    // Exercise
    const result = await authService.refresh("refresh-token");

    // Assertion
    expect(mockedJwtUtil.verifyToken).toHaveBeenCalledWith("refresh-token", "refresh", undefined);
    expect(result).toEqual({ accessToken: "access-token" });
    expect(mockedRepository.updateRefreshToken).not.toHaveBeenCalled();
  });

  /** refresh는 ignoreExpiration을 넘기지 않으므로 만료된 토큰은 실제로 여기서 거절된다 (logout과 반대) */
  test("리프레시 토큰이 만료됐으면 REFRESH_TOKEN_EXPIRED를 던진다", async () => {
    // Setup
    const expiredError = new Error("jwt expired");
    expiredError.name = "TokenExpiredError";
    mockedJwtUtil.verifyToken.mockImplementation(() => {
      throw expiredError;
    });

    // Exercise
    const result = authService.refresh("refresh-token");

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.REFRESH_TOKEN_EXPIRED,
    });
  });
});

describe("authService.checkEmail", () => {
  const dto = { role: "CUSTOMER" as const, email: "test@moving.com" };

  test("이미 가입된 이메일이면 available: false를 반환한다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);

    // Exercise
    const result = await authService.checkEmail(dto);

    // Assertion
    expect(result).toEqual({ available: false });
  });

  test("가입된 적 없는 이메일이면 available: true를 반환한다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue(null);

    // Exercise
    const result = await authService.checkEmail(dto);

    // Assertion
    expect(result).toEqual({ available: true });
  });
});

describe("authService.oauthLogin", () => {
  const dto = { role: "CUSTOMER" as const, code: "auth-code", redirectUri: "https://app/callback" };

  beforeEach(() => {
    mockedToSocialProvider.mockReturnValue("GOOGLE");
  });

  test("기존 소셜 회원이면 바로 로그인 처리한다", async () => {
    // Setup
    mockedExchangeOAuthCode.mockResolvedValue({
      providerId: "google-1",
      email: "test@moving.com",
      name: "김코드",
      profileImage: null,
    });
    mockedRepository.findBySocialAndRole.mockResolvedValue(makeUser() as never);

    // Exercise
    const result = await authService.oauthLogin("google", dto);

    // Assertion
    expect(result.isNewUser).toBe(false);
    if (!result.isNewUser) {
      expect(result.user.email).toBe("test@moving.com");
      expect(result.accessToken).toBe("access-token");
      expect(result.refreshToken).toBe("refresh-token");
    }
  });

  test("신규 소셜 회원이고 이메일이 유효하면 oauthSignupToken을 발급한다", async () => {
    // Setup
    mockedExchangeOAuthCode.mockResolvedValue({
      providerId: "google-1",
      email: "test@moving.com",
      name: "김코드",
      profileImage: null,
    });
    mockedRepository.findBySocialAndRole.mockResolvedValue(null);
    mockedOauthSignupTokenUtil.create.mockReturnValue("signup-token");

    // Exercise
    const result = await authService.oauthLogin("google", dto);

    // Assertion
    expect(result.isNewUser).toBe(true);
    if (result.isNewUser) {
      expect(result.oauthSignupToken).toBe("signup-token");
    }
    expect(mockedOauthSignupTokenUtil.create).toHaveBeenCalledWith({
      provider: "GOOGLE",
      providerId: "google-1",
      email: "test@moving.com",
      name: "김코드",
      role: "CUSTOMER",
    });
  });

  test("신규 소셜 회원인데 이메일 제공에 동의하지 않았으면 400을 던진다", async () => {
    // Setup
    mockedExchangeOAuthCode.mockResolvedValue({
      providerId: "google-1",
      email: "",
      name: "김코드",
      profileImage: null,
    });
    mockedRepository.findBySocialAndRole.mockResolvedValue(null);

    // Exercise
    const result = authService.oauthLogin("google", dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.OAUTH_EMAIL_REQUIRED,
    });
    expect(mockedOauthSignupTokenUtil.create).not.toHaveBeenCalled();
  });
});

describe("authService.oauthSignup", () => {
  const token = "signup-token";
  const dto = { phoneNumber: "01012345678" };
  const payload = {
    provider: "GOOGLE" as const,
    providerId: "google-1",
    email: "test@moving.com",
    name: "김코드",
    role: "CUSTOMER" as const,
  };

  test("전화번호를 받아 소셜 계정 생성을 완료한다", async () => {
    // Setup
    mockedOauthSignupTokenUtil.verify.mockReturnValue(payload);
    mockedRepository.findBySocialAndRole.mockResolvedValue(null);
    mockedRepository.create.mockResolvedValue(makeUser() as never);

    // Exercise
    const result = await authService.oauthSignup(token, dto);

    // Assertion
    expect(mockedRepository.create).toHaveBeenCalledWith({
      role: "CUSTOMER",
      name: "김코드",
      email: "test@moving.com",
      phoneNumber: "01012345678",
      provider: "GOOGLE",
      providerId: "google-1",
    });
    expect(result.hasProfile).toBe(false);
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
  });

  test("소셜 가입용 서명 토큰이 유효하지 않으면 401을 던진다", async () => {
    // Setup
    mockedOauthSignupTokenUtil.verify.mockImplementation(() => {
      throw new Error("invalid token");
    });

    // Exercise
    const result = authService.oauthSignup(token, dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_OR_EXPIRED_SIGNUP_TOKEN,
    });
  });

  test("이미 같은 소셜 계정으로 가입된 유저가 있으면 409를 던진다", async () => {
    // Setup
    mockedOauthSignupTokenUtil.verify.mockReturnValue(payload);
    mockedRepository.findBySocialAndRole.mockResolvedValue(makeUser() as never);

    // Exercise
    const result = authService.oauthSignup(token, dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.PROVIDER_ACCOUNT_ALREADY_LINKED,
    });
    expect(mockedRepository.create).not.toHaveBeenCalled();
  });

  test("거의 동시에 같은 소셜 계정으로 가입 요청이 겹치면 409를 던진다", async () => {
    // Setup
    mockedOauthSignupTokenUtil.verify.mockReturnValue(payload);
    mockedRepository.findBySocialAndRole.mockResolvedValue(null);
    mockedRepository.create.mockRejectedValue(makeP2002Error());

    // Exercise
    const result = authService.oauthSignup(token, dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 409,
      code: ERROR_CODES.PROVIDER_ACCOUNT_ALREADY_LINKED,
    });
  });

  test("계정 연결 중복이 아닌 다른 이유로 저장이 실패하면 에러를 그대로 전파한다", async () => {
    // Setup
    mockedOauthSignupTokenUtil.verify.mockReturnValue(payload);
    mockedRepository.findBySocialAndRole.mockResolvedValue(null);
    const unknownError = new Error("db down");
    mockedRepository.create.mockRejectedValue(unknownError);

    // Exercise
    const result = authService.oauthSignup(token, dto);

    // Assertion
    await expect(result).rejects.toBe(unknownError);
  });
});

describe("authService.findEmail", () => {
  const dto = { role: "CUSTOMER" as const, name: "김코드", phoneNumber: "01012345678" };

  test("일치하는 계정의 이메일을 가려서 가입 경로와 함께 반환한다", async () => {
    // Setup
    mockedRepository.findAccountsByNameAndPhone.mockResolvedValue([
      { email: "abcdef@naver.com", provider: "LOCAL" },
      { email: "abcdef@naver.com", provider: "KAKAO" },
    ] as never);

    // Exercise
    const result = await authService.findEmail(dto);

    // Assertion
    expect(mockedRepository.findAccountsByNameAndPhone).toHaveBeenCalledWith(
      "CUSTOMER",
      "김코드",
      "01012345678"
    );
    expect(result).toEqual({
      accounts: [
        { email: "ab***@naver.com", provider: "LOCAL" },
        { email: "ab***@naver.com", provider: "KAKAO" },
      ],
    });
  });

  test("아이디가 2자 이하면 앞 1자만 남기고, 별표 개수는 길이와 관계없이 3개로 고정한다", async () => {
    // Setup
    mockedRepository.findAccountsByNameAndPhone.mockResolvedValue([
      { email: "ab@naver.com", provider: "LOCAL" },
      { email: "a@naver.com", provider: "LOCAL" },
      { email: "abcdefghij@naver.com", provider: "LOCAL" },
    ] as never);

    // Exercise
    const result = await authService.findEmail(dto);

    // Assertion
    expect(result.accounts.map((a) => a.email)).toEqual([
      "a***@naver.com",
      "a***@naver.com",
      "ab***@naver.com",
    ]);
  });

  test("provider가 비어 있으면 이메일 가입 계정으로 보고 LOCAL로 채운다", async () => {
    // Setup
    mockedRepository.findAccountsByNameAndPhone.mockResolvedValue([
      { email: "abcdef@naver.com", provider: null },
    ] as never);

    // Exercise
    const result = await authService.findEmail(dto);

    // Assertion
    expect(result.accounts[0].provider).toBe("LOCAL");
  });

  test("일치하는 계정이 없으면 404가 아니라 빈 배열을 반환한다", async () => {
    // Setup
    mockedRepository.findAccountsByNameAndPhone.mockResolvedValue([]);

    // Exercise
    const result = await authService.findEmail(dto);

    // Assertion
    expect(result).toEqual({ accounts: [] });
  });
});

describe("authService.sendPasswordResetCode", () => {
  const dto = { role: "CUSTOMER" as const, email: "test@moving.com" };

  test("가입된 계정이면 6자리 인증번호를 해시로 저장하고, 같은 번호를 메일로 보낸 뒤 true를 반환한다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedHashUtil.hashResetCode.mockReturnValue("hashed-code");
    mockedMailer.sendMail.mockResolvedValue({} as never);
    const before = Date.now();

    // Exercise
    const result = await authService.sendPasswordResetCode(dto);

    // Assertion
    expect(result).toBe(true);

    const [code] = mockedHashUtil.hashResetCode.mock.calls[0];
    expect(code).toMatch(/^\d{6}$/);

    const [userId, codeHash, expiresAt] = mockedRepository.replacePasswordResetCode.mock.calls[0];
    expect(userId).toBe(1);
    expect(codeHash).toBe("hashed-code");
    // 유효시간 5분
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);

    const [mail] = mockedMailer.sendMail.mock.calls[0];
    expect(mail.to).toBe("test@moving.com");
    // DB엔 해시만, 메일엔 평문 — 해시한 원본과 메일 속 번호가 같아야 한다
    expect(mail.text).toContain(`인증번호: ${code}`);
    expect(mail.html).toBe("<html>rendered</html>");
  });

  test("가입되지 않은 이메일이면 저장도 발송도 하지 않고 false를 반환한다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue(null);

    // Exercise
    const result = await authService.sendPasswordResetCode(dto);

    // Assertion
    expect(result).toBe(false);
    expect(mockedRepository.replacePasswordResetCode).not.toHaveBeenCalled();
    expect(mockedMailer.sendMail).not.toHaveBeenCalled();
  });

  test("같은 유저의 동시 요청으로 저장이 충돌하면 메일을 보내지 않고 false를 반환한다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedHashUtil.hashResetCode.mockReturnValue("hashed-code");
    mockedRepository.replacePasswordResetCode.mockRejectedValue(makeP2002Error());

    // Exercise
    const result = await authService.sendPasswordResetCode(dto);

    // Assertion
    expect(result).toBe(false);
    expect(mockedMailer.sendMail).not.toHaveBeenCalled();
  });

  test("동시 요청 충돌이 아닌 다른 이유로 저장이 실패하면 에러를 그대로 전파한다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedHashUtil.hashResetCode.mockReturnValue("hashed-code");
    const unknownError = new Error("db down");
    mockedRepository.replacePasswordResetCode.mockRejectedValue(unknownError);

    // Exercise
    const result = authService.sendPasswordResetCode(dto);

    // Assertion
    await expect(result).rejects.toBe(unknownError);
  });

  test("메일 발송이 실패해도 에러를 던지지 않고 로그만 남긴 뒤 false를 반환한다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedHashUtil.hashResetCode.mockReturnValue("hashed-code");
    // clearAllMocks는 앞 테스트의 mockRejectedValue를 지우지 않으므로 저장 성공을 명시한다
    mockedRepository.replacePasswordResetCode.mockResolvedValue({} as never);
    mockedMailer.sendMail.mockRejectedValue(new Error("smtp down") as never);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    // Exercise
    const result = await authService.sendPasswordResetCode(dto);

    // Assertion
    expect(result).toBe(false);
    expect(consoleError).toHaveBeenCalled();

    // Teardown
    consoleError.mockRestore();
  });
});

describe("authService.verifyPasswordResetCode", () => {
  const dto = { role: "CUSTOMER" as const, email: "test@moving.com", code: "123456" };

  function makeResetCode(overrides = {}) {
    return {
      id: 7,
      userId: 1,
      codeHash: "hashed-code",
      expiresAt: new Date(Date.now() + 60 * 1000),
      failedAttempts: 0,
      usedAt: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  test("인증번호가 맞으면 userId와 codeId를 담은 재설정 토큰을 발급한다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedRepository.findPasswordResetCodeByUserId.mockResolvedValue(makeResetCode());
    mockedHashUtil.compareResetCode.mockReturnValue(true);
    mockedPasswordResetTokenUtil.create.mockReturnValue("reset-token");

    // Exercise
    const result = await authService.verifyPasswordResetCode(dto);

    // Assertion
    expect(mockedHashUtil.compareResetCode).toHaveBeenCalledWith("123456", "hashed-code");
    expect(mockedPasswordResetTokenUtil.create).toHaveBeenCalledWith({ userId: 1, codeId: 7 });
    expect(result).toBe("reset-token");
    expect(mockedRepository.incrementResetCodeFailedAttempts).not.toHaveBeenCalled();
  });

  test.each([
    ["가입되지 않은 이메일", null, null],
    ["발송 이력이 없는 계정", { id: 1 }, null],
    ["이미 재설정에 사용한 인증번호", { id: 1 }, makeResetCode({ usedAt: new Date() })],
  ])(
    "%s이면 실제 불일치와 구분되지 않도록 같은 INVALID_RESET_CODE를 던진다",
    async (_label, user, resetCode) => {
      // Setup
      mockedRepository.existsByEmailAndRole.mockResolvedValue(user as never);
      mockedRepository.findPasswordResetCodeByUserId.mockResolvedValue(resetCode as never);

      // Exercise
      const result = authService.verifyPasswordResetCode(dto);

      // Assertion
      await expect(result).rejects.toMatchObject({
        statusCode: 400,
        code: ERROR_CODES.INVALID_RESET_CODE,
        message: "인증번호가 일치하지 않습니다",
      });
      expect(mockedPasswordResetTokenUtil.create).not.toHaveBeenCalled();
    }
  );

  test("유효시간이 지났으면 번호를 비교하지 않고 RESET_CODE_EXPIRED를 던진다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedRepository.findPasswordResetCodeByUserId.mockResolvedValue(
      makeResetCode({ expiresAt: new Date(Date.now() - 1000) })
    );

    // Exercise
    const result = authService.verifyPasswordResetCode(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.RESET_CODE_EXPIRED,
    });
    expect(mockedHashUtil.compareResetCode).not.toHaveBeenCalled();
  });

  test("이미 5번 틀린 인증번호면 맞는 번호를 넣어도 RESET_CODE_ATTEMPTS_EXCEEDED를 던진다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedRepository.findPasswordResetCodeByUserId.mockResolvedValue(
      makeResetCode({ failedAttempts: 5 })
    );
    mockedHashUtil.compareResetCode.mockReturnValue(true);

    // Exercise
    const result = authService.verifyPasswordResetCode(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.RESET_CODE_ATTEMPTS_EXCEEDED,
    });
    expect(mockedPasswordResetTokenUtil.create).not.toHaveBeenCalled();
  });

  test("틀렸지만 기회가 남아 있으면(증가 후 1~4) 틀린 횟수를 올리고 INVALID_RESET_CODE를 던진다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedRepository.findPasswordResetCodeByUserId.mockResolvedValue(
      makeResetCode({ failedAttempts: 3 })
    );
    mockedHashUtil.compareResetCode.mockReturnValue(false);
    mockedRepository.incrementResetCodeFailedAttempts.mockResolvedValue(4);

    // Exercise
    const result = authService.verifyPasswordResetCode(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({ code: ERROR_CODES.INVALID_RESET_CODE });
    expect(mockedRepository.incrementResetCodeFailedAttempts).toHaveBeenCalledWith(7, 5);
  });

  test("이번이 5번째로 틀린 것이면(증가 후 5) 그 인증번호를 무효로 보고 RESET_CODE_ATTEMPTS_EXCEEDED를 던진다", async () => {
    // Setup
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedRepository.findPasswordResetCodeByUserId.mockResolvedValue(
      makeResetCode({ failedAttempts: 4 })
    );
    mockedHashUtil.compareResetCode.mockReturnValue(false);
    mockedRepository.incrementResetCodeFailedAttempts.mockResolvedValue(5);

    // Exercise
    const result = authService.verifyPasswordResetCode(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      code: ERROR_CODES.RESET_CODE_ATTEMPTS_EXCEEDED,
    });
  });

  test("동시 요청이 먼저 상한을 채워 횟수를 올리지 못했으면(null) RESET_CODE_ATTEMPTS_EXCEEDED를 던진다", async () => {
    // Setup: 읽은 시점엔 4였지만, 그 사이 다른 요청이 5를 채운 상황
    mockedRepository.existsByEmailAndRole.mockResolvedValue({ id: 1 } as never);
    mockedRepository.findPasswordResetCodeByUserId.mockResolvedValue(
      makeResetCode({ failedAttempts: 4 })
    );
    mockedHashUtil.compareResetCode.mockReturnValue(false);
    mockedRepository.incrementResetCodeFailedAttempts.mockResolvedValue(null);

    // Exercise
    const result = authService.verifyPasswordResetCode(dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      code: ERROR_CODES.RESET_CODE_ATTEMPTS_EXCEEDED,
    });
  });
});

describe("authService.resetPassword", () => {
  const token = "reset-token";
  const dto = { newPassword: "NewPass1!" };

  test("재설정 토큰이 유효하면 새 비밀번호를 해시해서 사용 처리와 함께 저장한다", async () => {
    // Setup
    mockedPasswordResetTokenUtil.verify.mockReturnValue({ userId: 1, codeId: 7 });
    mockedHashUtil.hashPassword.mockResolvedValue("hashed-new-password");
    mockedRepository.completePasswordReset.mockResolvedValue(true);

    // Exercise
    const result = authService.resetPassword(token, dto);

    // Assertion
    await expect(result).resolves.toBeUndefined();
    expect(mockedPasswordResetTokenUtil.verify).toHaveBeenCalledWith("reset-token");
    expect(mockedHashUtil.hashPassword).toHaveBeenCalledWith("NewPass1!");
    expect(mockedRepository.completePasswordReset).toHaveBeenCalledWith(
      7,
      1,
      "hashed-new-password"
    );
  });

  test("토큰이 만료·위조됐으면 비밀번호를 해시하거나 저장하지 않고 401을 던진다", async () => {
    // Setup
    mockedPasswordResetTokenUtil.verify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    // Exercise
    const result = authService.resetPassword(token, dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_OR_EXPIRED_RESET_TOKEN,
    });
    expect(mockedHashUtil.hashPassword).not.toHaveBeenCalled();
    expect(mockedRepository.completePasswordReset).not.toHaveBeenCalled();
  });

  test("이미 사용했거나 재발송으로 바뀐 인증 건의 토큰이면 같은 401을 던진다", async () => {
    // Setup: 토큰 서명·만료는 멀쩡하지만 DB에서 사용 처리할 행이 없는 상황
    mockedPasswordResetTokenUtil.verify.mockReturnValue({ userId: 1, codeId: 7 });
    mockedHashUtil.hashPassword.mockResolvedValue("hashed-new-password");
    mockedRepository.completePasswordReset.mockResolvedValue(false);

    // Exercise
    const result = authService.resetPassword(token, dto);

    // Assertion
    await expect(result).rejects.toMatchObject({
      statusCode: 401,
      code: ERROR_CODES.INVALID_OR_EXPIRED_RESET_TOKEN,
    });
  });
});
