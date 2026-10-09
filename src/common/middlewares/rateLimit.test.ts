import { EventEmitter } from "node:events";
import type { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "../errors/errorCodes";
import type { RateLimitRequestHandler } from "express-rate-limit";
import {
  loginRateLimiter,
  resetCodeRateLimiters,
  signupCodeRateLimiters,
  dailyMailLimiter,
} from "./rateLimit";
import { authController } from "../../modules/auth/auth.controller";
import { authService } from "../../modules/auth/auth.service";

// 발송 상한 환불은 컨트롤러가 서비스 결과로 결정하므로, 서비스만 흉내내고 DB·S3 의존 모듈은 막는다
jest.mock("../../modules/auth/auth.service", () => ({
  authService: { sendPasswordResetCode: jest.fn(), sendSignupCode: jest.fn() },
}));
jest.mock("../../modules/profile/profile.service", () => ({ profileService: {} }));

const mockedSendPasswordResetCode = jest.mocked(authService.sendPasswordResetCode);
const mockedSendSignupCode = jest.mocked(authService.sendSignupCode);

type Role = "CUSTOMER" | "MOVER";

function makeReq(email: string, role: Role = "CUSTOMER"): Request {
  return { body: { role, email } } as unknown as Request;
}

// skipSuccessfulRequests가 res.once("finish")를 구독하므로 EventEmitter 기반으로 만듭니다
function makeRes() {
  const res = new EventEmitter() as unknown as Response;
  res.statusCode = 200;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.headersSent = false;
  res.locals = {};
  return res;
}

/**
 * 로그인 요청 1회를 흉내냅니다.
 * 미들웨어를 통과하면(next 호출) 컨트롤러가 statusCode로 응답했다고 보고 finish를 발생시킵니다.
 * 카운트 차감은 finish 이후 비동기로 일어나므로 마이크로태스크를 한 번 비워줍니다.
 */
async function attemptLogin(req: Request, statusCode: number) {
  const res = makeRes();
  const next = jest.fn() as unknown as NextFunction;

  await loginRateLimiter(req, res, next);

  const passed = (next as jest.Mock).mock.calls.length > 0;
  if (passed) res.statusCode = statusCode;
  res.emit("finish");
  await new Promise((resolve) => setImmediate(resolve));

  return { res, passed };
}

describe("loginRateLimiter", () => {
  test("같은 계정으로 15분에 5회 실패까지는 next를 호출해 통과시킨다", async () => {
    // Setup
    const req = makeReq("limit-pass@test.com");

    // Exercise
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await attemptLogin(req, 401));
    }

    // Assertion
    expect(results.every((r) => r.passed)).toBe(true);
    results.forEach(({ res }) => expect(res.status).not.toHaveBeenCalled());
  });

  test("같은 계정으로 5회 실패 후 6번째 요청부터는 429 TOO_MANY_REQUESTS를 응답한다", async () => {
    // Setup
    const req = makeReq("limit-exceed@test.com");

    // Exercise
    for (let i = 0; i < 5; i++) {
      await attemptLogin(req, 401);
    }
    const { res, passed } = await attemptLogin(req, 401);

    // Assertion
    expect(passed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ERROR_CODES.TOO_MANY_REQUESTS,
        message: expect.any(String),
        retryAfterSeconds: expect.any(Number),
      },
    });

    const [[body]] = (res.json as jest.Mock).mock.calls;
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.error.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  test("로그인에 성공한 요청은 카운트에 포함하지 않는다", async () => {
    // Setup
    const req = makeReq("limit-success@test.com");

    // Exercise: 한도(5회)를 넘는 6번의 성공 후, 실패 1회
    for (let i = 0; i < 6; i++) {
      await attemptLogin(req, 200);
    }
    const { res, passed } = await attemptLogin(req, 401);

    // Assertion: 성공은 차감되어 7번째 요청도 통과한다
    expect(passed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("이메일이 다르면 서로 다른 카운트로 취급한다", async () => {
    // Exercise: A는 한도(5회)를 모두 소진하고, B는 처음 요청
    for (let i = 0; i < 5; i++) {
      await attemptLogin(makeReq("user-a@test.com"), 401);
    }
    const { res, passed } = await attemptLogin(makeReq("user-b@test.com"), 401);

    // Assertion: B는 A의 카운트에 영향받지 않고 통과한다
    expect(passed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("이메일이 같아도 role이 다르면 서로 다른 카운트로 취급한다", async () => {
    // Exercise: CUSTOMER 계정이 한도(5회)를 모두 소진하고, 같은 이메일의 MOVER 계정이 처음 요청
    for (let i = 0; i < 5; i++) {
      await attemptLogin(makeReq("same-email@test.com", "CUSTOMER"), 401);
    }
    const { res, passed } = await attemptLogin(makeReq("same-email@test.com", "MOVER"), 401);

    // Assertion: MOVER는 CUSTOMER의 카운트에 영향받지 않고 통과한다
    expect(passed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});

/**
 * limiter 하나에 요청 1회를 흉내냅니다. 통과하면 컨트롤러가 응답했다고 보고 finish를 발생시키며,
 * mailSent가 true면 컨트롤러가 실제로 메일을 보낸 것처럼 res.locals에 표시합니다.
 */
async function attempt(
  limiter: RateLimitRequestHandler,
  req: Request,
  { mailSent = false }: { mailSent?: boolean } = {}
) {
  const res = makeRes();
  const next = jest.fn() as unknown as NextFunction;

  await limiter(req, res, next);

  const passed = (next as jest.Mock).mock.calls.length > 0;
  if (passed) {
    res.statusCode = 204;
    if (mailSent) res.locals.mailSent = true;
  }
  res.emit("finish");
  await new Promise((resolve) => setImmediate(resolve));

  return { res, passed };
}

describe("resetCodeRateLimiters (계정 기준 인증번호 발송 제한)", () => {
  const [perMinute, perHour, perDay] = resetCodeRateLimiters;

  test.each([
    ["1분", perMinute, 1, "인증번호는 1분에 한 번만 요청할 수 있습니다"],
    ["1시간", perHour, 5, "인증번호 요청 횟수를 초과했습니다. 잠시 후 다시 시도해주세요"],
    ["하루", perDay, 10, "인증번호 요청 횟수를 초과했습니다. 잠시 후 다시 시도해주세요"],
  ])(
    "%s 한도(%i회)까지는 통과시키고, 넘으면 429와 안내 문구를 응답한다",
    async (label, limiter, limit, message) => {
      // Setup
      const req = makeReq(`reset-${label}@test.com`);

      // Exercise
      const allowed = [];
      for (let i = 0; i < limit; i++) {
        allowed.push(await attempt(limiter, req));
      }
      const { res, passed } = await attempt(limiter, req);

      // Assertion
      expect(allowed.every((r) => r.passed)).toBe(true);
      expect(passed).toBe(false);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: ERROR_CODES.TOO_MANY_REQUESTS,
          message,
          retryAfterSeconds: expect.any(Number),
        },
      });
    }
  );

  test("응답이 성공(204)이어도 되돌리지 않고 모든 요청을 센다", async () => {
    // Setup: 가입 여부를 숨기려고 항상 204를 주므로, 성공 응답도 카운트에 남아야 한다
    const req = makeReq("reset-count-all@test.com");

    // Exercise
    await attempt(perMinute, req);
    const { passed } = await attempt(perMinute, req);

    // Assertion
    expect(passed).toBe(false);
  });

  test("이메일이나 role이 다르면 서로 다른 카운트로 취급한다", async () => {
    // Exercise: CUSTOMER 계정이 1분 한도를 소진한 뒤, 다른 이메일·같은 이메일의 MOVER가 요청
    await attempt(perMinute, makeReq("reset-a@test.com", "CUSTOMER"));
    const otherEmail = await attempt(perMinute, makeReq("reset-b@test.com", "CUSTOMER"));
    const otherRole = await attempt(perMinute, makeReq("reset-a@test.com", "MOVER"));

    // Assertion
    expect(otherEmail.passed).toBe(true);
    expect(otherRole.passed).toBe(true);
  });

  test("같은 계정이어도 회원가입 인증번호 제한과는 카운트를 공유하지 않는다", async () => {
    // Setup
    const req = makeReq("reset-signup@test.com");
    await attempt(perMinute, req);

    // Exercise: 재설정 1분 한도를 소진한 계정이 회원가입 인증번호를 요청
    const { passed } = await attempt(signupCodeRateLimiters[0], req);

    // Assertion
    expect(passed).toBe(true);
  });
});

/**
 * 일일 발송 상한 limiter → 실제 컨트롤러로 인증번호 발송 요청 1회를 흉내냅니다.
 * 환불은 컨트롤러가 발송 결과로 결정하므로 서비스만 mock하고 컨트롤러는 실제 코드를 씁니다.
 * disconnect가 true면 메일 발송 도중 클라이언트가 연결을 끊은 상황(close)을 만듭니다.
 */
async function sendCode(
  email: string,
  { mailSent = false, disconnect = false }: { mailSent?: boolean; disconnect?: boolean } = {}
) {
  const req = makeReq(email);
  const res = makeRes();
  const next = jest.fn() as unknown as NextFunction;

  await dailyMailLimiter(req, res, next);
  const passed = (next as jest.Mock).mock.calls.length > 0;

  if (passed) {
    mockedSendPasswordResetCode.mockImplementationOnce(async () => {
      if (disconnect) {
        res.emit("close");
        await new Promise((resolve) => setImmediate(resolve));
      }
      return mailSent;
    });
    await authController.sendPasswordResetCode(req, res, jest.fn());
  }
  if (!disconnect) res.emit("finish");
  await new Promise((resolve) => setImmediate(resolve));

  return { res, passed };
}

describe("dailyMailLimiter (서비스 전체 일일 발송 상한)", () => {
  const GLOBAL_KEY = "verification-mail";
  const totalHits = async () => (await dailyMailLimiter.getKey(GLOBAL_KEY))?.totalHits ?? 0;

  // Setup/Teardown: 키가 하나뿐인 전역 limiter라 테스트끼리 카운트가 섞이지 않도록 매번 비운다
  beforeEach(async () => {
    await dailyMailLimiter.resetKey(GLOBAL_KEY);
  });

  test("실제로 메일을 보내지 않은 요청(미가입 이메일 등)은 카운트를 되돌린다", async () => {
    // Exercise: 서로 다른 미가입 이메일로 상한(400)보다 많이 요청
    const results = [];
    for (let i = 0; i < 450; i++) {
      results.push(await sendCode(`nobody${i}@test.com`));
    }

    // Assertion: 모두 통과하고 카운트는 0 — 아무 이메일로 상한을 소진하는 공격이 통하지 않는다
    expect(results.every((r) => r.passed)).toBe(true);
    expect(await totalHits()).toBe(0);
  });

  test("서비스가 에러를 던져 메일을 보내지 못한 요청도 카운트를 되돌린다", async () => {
    // Setup
    const req = makeReq("error@test.com");
    const res = makeRes();
    await dailyMailLimiter(req, res, jest.fn());
    mockedSendPasswordResetCode.mockRejectedValueOnce(new Error("db down"));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    // Exercise
    await authController.sendPasswordResetCode(req, res, jest.fn());

    // Assertion: 응답은 이미 204로 나갔으므로 에러는 로그로만 남고, 미리 센 한 통은 되돌린다
    expect(consoleError).toHaveBeenCalled();
    expect(await totalHits()).toBe(0);
    consoleError.mockRestore();
  });

  test("메일 발송 도중 연결이 끊겨도, 메일을 보냈다면 카운트를 되돌리지 않는다", async () => {
    // Exercise: 요청 후 응답 전에 연결을 끊는 방식으로 상한 우회를 시도
    await sendCode("disconnect@test.com", { mailSent: true, disconnect: true });

    // Assertion: 메일은 나갔으므로 한 통으로 남는다
    expect(await totalHits()).toBe(1);
  });

  test("실제 발송이 400통에 도달하면 이후 요청은 계정과 관계없이 429로 막는다", async () => {
    // Exercise
    for (let i = 0; i < 400; i++) {
      await sendCode(`user${i}@test.com`, { mailSent: true });
    }
    const { res, passed } = await sendCode("new@test.com");

    // Assertion
    expect(passed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: ERROR_CODES.TOO_MANY_REQUESTS,
        message: "일시적으로 인증번호를 보낼 수 없습니다. 잠시 후 다시 시도해주세요",
        retryAfterSeconds: expect.any(Number),
      },
    });
  });

  test("회원가입 인증번호도 같은 상한을 쓰며, 보낸 메일만 남기고 실패(409·발송 실패)는 되돌린다", async () => {
    // Setup
    const send = async (email: string) => {
      const req = makeReq(email);
      await dailyMailLimiter(req, makeRes(), jest.fn());
      await authController.sendSignupCode(req, makeRes(), jest.fn());
    };
    mockedSendSignupCode
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("이미 가입된 이메일"))
      .mockRejectedValueOnce(new Error("smtp down"));

    // Exercise
    await send("signup-ok@test.com");
    await send("signup-exists@test.com");
    await send("signup-smtp@test.com");

    // Assertion
    expect(await totalHits()).toBe(1);
  });
});
