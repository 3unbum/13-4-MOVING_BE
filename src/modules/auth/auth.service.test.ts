import { Prisma } from "../../../generated/prisma/client";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { authService } from "./auth.service";
import { authRepository } from "./auth.repository";
import hashUtil from "../../common/utils/hash.util";
import jwtUtil from "../../common/utils/jwt.util";
import { exchangeOAuthCode, toSocialProvider } from "./oauth/dispatcher";
import oauthSignupTokenUtil from "./oauth/oauthSignupToken.util";

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
  },
}));

jest.mock("../../common/utils/hash.util", () => ({
  __esModule: true,
  default: {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
    hashRefreshToken: jest.fn(),
    compareRefreshToken: jest.fn(),
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
  const dto = { oauthSignupToken: "signup-token", phoneNumber: "01012345678" };
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
    const result = await authService.oauthSignup(dto);

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
    const result = authService.oauthSignup(dto);

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
    const result = authService.oauthSignup(dto);

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
    const result = authService.oauthSignup(dto);

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
    const result = authService.oauthSignup(dto);

    // Assertion
    await expect(result).rejects.toBe(unknownError);
  });
});
